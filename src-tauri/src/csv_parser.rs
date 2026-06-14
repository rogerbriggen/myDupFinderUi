use std::io::{BufRead, BufReader, Read};
use std::path::Path;

use csv::{ReaderBuilder, StringRecord};

use crate::error::{AppError, AppResult};
use crate::model::{Category, Row, Source};

pub const EXPECTED_HEADER: &str = "FilenameAndPath;FileSize;FileSha512Hash;Category;Source;GroupId";

pub const CHECK_REPORT_MARKER: &str = "# myDupFinder check report";

/// Granularity (in rows) at which the streaming parser invokes its progress
/// callback. Chosen so the overhead is negligible even on very large reports
/// (200 k+ rows ≈ 40 callbacks).
const PROGRESS_INTERVAL: usize = 5_000;

/// Progress snapshot reported during a streaming parse.
#[derive(Debug, Clone, Copy)]
pub struct ParseProgress {
    /// Total rows parsed so far (excluding the header).
    pub rows_read: usize,
    /// Bytes consumed from the underlying reader so far. For a file this is
    /// the byte offset; for an in-memory reader the same definition holds.
    pub bytes_read: u64,
    /// Total size of the input in bytes, when known up front (e.g. a file on
    /// disk). `None` for unbounded readers.
    pub total_bytes: Option<u64>,
}

/// Parse a dupReport CSV file from disk in a single streaming pass.
/// Used by tests and as the default no-progress path; production code calls
/// [`parse_dup_report_with_progress`] from the Tauri command.
#[cfg(test)]
pub fn parse_dup_report(path: &Path) -> AppResult<Vec<Row>> {
    let file = std::fs::File::open(path)?;
    let total_bytes = file.metadata().ok().map(|m| m.len());
    parse_dup_report_streaming(file, total_bytes, |_| {})
}

/// Parse a dupReport CSV file from disk, invoking `on_progress` periodically.
/// Used by the Tauri `open_report` command to surface progress events.
pub fn parse_dup_report_with_progress(
    path: &Path,
    on_progress: impl FnMut(ParseProgress),
) -> AppResult<Vec<Row>> {
    let file = std::fs::File::open(path)?;
    let total_bytes = file.metadata().ok().map(|m| m.len());
    parse_dup_report_streaming(file, total_bytes, on_progress)
}

/// Parse from any `Read`. Used in tests with in-memory data.
#[cfg(test)]
pub fn parse_dup_report_from_reader<R: Read>(reader: R) -> AppResult<Vec<Row>> {
    parse_dup_report_streaming(reader, None, |_| {})
}

/// Streaming parse. Performs a single forward pass over `reader`:
/// 1. Peeks the first line via `BufReader::fill_buf` (no consumption) to
///    detect the check-report sibling format and validate the header bytes.
/// 2. Hands the same `BufReader` to `csv::Reader`, which then consumes the
///    header and streams records one at a time.
///
/// The whole file is never held in memory as a single `String`; only the
/// resulting `Vec<Row>` (which the rest of the app needs for filtering and
/// the identical-folder scan) accumulates.
///
/// `on_progress` is invoked every `PROGRESS_INTERVAL` rows and once more
/// after the final row. It must be cheap — keep it to a counter bump or
/// a debounced Tauri `emit`.
pub fn parse_dup_report_streaming<R: Read>(
    reader: R,
    total_bytes: Option<u64>,
    mut on_progress: impl FnMut(ParseProgress),
) -> AppResult<Vec<Row>> {
    let mut buf_reader = BufReader::with_capacity(64 * 1024, reader);
    sniff_first_line(&mut buf_reader)?;

    let mut rdr = ReaderBuilder::new()
        .delimiter(b';')
        .quote(b'"')
        .has_headers(true)
        .flexible(false)
        .from_reader(buf_reader);

    let headers = rdr.headers()?.clone();
    let actual_header = headers.iter().collect::<Vec<_>>().join(";");
    if actual_header != EXPECTED_HEADER {
        return Err(AppError::InvalidReport(format!(
            "Unexpected CSV header: '{}'",
            actual_header
        )));
    }

    let mut rows = Vec::new();
    let mut record = StringRecord::new();
    while rdr.read_record(&mut record)? {
        // The csv reader counts header as line 1, so the first data row is 2.
        let line_no = rows.len() + 2;
        rows.push(parse_record(&record, line_no)?);

        if rows.len() % PROGRESS_INTERVAL == 0 {
            on_progress(ParseProgress {
                rows_read: rows.len(),
                bytes_read: rdr.position().byte(),
                total_bytes,
            });
        }
    }
    on_progress(ParseProgress {
        rows_read: rows.len(),
        bytes_read: rdr.position().byte(),
        total_bytes,
    });
    Ok(rows)
}

fn parse_record(rec: &StringRecord, line_no: usize) -> AppResult<Row> {
    if rec.len() != 6 {
        return Err(AppError::InvalidReport(format!(
            "Row {} has {} fields, expected 6",
            line_no,
            rec.len()
        )));
    }
    let filename_and_path = rec[0].to_string();
    let file_size = rec[1].parse::<i64>().map_err(|e| {
        AppError::InvalidReport(format!("Row {}: invalid FileSize: {}", line_no, e))
    })?;
    let file_sha512_hash = rec[2].to_string();
    let category = Category::parse(&rec[3]).ok_or_else(|| {
        AppError::InvalidReport(format!("Row {}: unknown Category '{}'", line_no, &rec[3]))
    })?;
    let source = Source::parse(&rec[4]).ok_or_else(|| {
        AppError::InvalidReport(format!("Row {}: unknown Source '{}'", line_no, &rec[4]))
    })?;
    let group_id = rec[5]
        .parse::<i32>()
        .map_err(|e| AppError::InvalidReport(format!("Row {}: invalid GroupId: {}", line_no, e)))?;

    Ok(Row {
        filename_and_path,
        file_size,
        file_sha512_hash,
        category,
        source,
        group_id,
    })
}

/// Peek at the first line of the input via `BufReader::fill_buf` without
/// consuming any bytes. The buffered bytes remain in place for `csv::Reader`
/// to read the header itself.
///
/// Errors with `Unsupported` for the check-report sibling format. If the
/// peeked line looks like the wrong header we let `csv::Reader` produce the
/// definitive error message later — its parsing handles quoting correctly.
fn sniff_first_line<R: BufRead>(reader: &mut R) -> AppResult<()> {
    let buf = reader.fill_buf()?;
    let end = buf
        .iter()
        .position(|&b| b == b'\n')
        .map(|i| i + 1)
        .unwrap_or(buf.len());
    let first_line = String::from_utf8_lossy(&buf[..end]);
    let trimmed = first_line.trim_end_matches(['\r', '\n']);

    if trimmed.starts_with(CHECK_REPORT_MARKER) {
        return Err(AppError::Unsupported(
            "myDupFinder check reports are not supported yet.".into(),
        ));
    }
    Ok(())
}

/// Extract `<JobName>` from `"<JobName> dupReport.csv"`.
pub fn job_name_from_path(path: &Path) -> String {
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
    stem.strip_suffix(" dupReport").unwrap_or(stem).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::io::Cursor;

    const SAMPLE_ONLY_DUPS: &str =
        "FilenameAndPath;FileSize;FileSha512Hash;Category;Source;GroupId\r\n\
\"C:\\a\\b\\one.txt\";123;ABCDEF;Duplicate;Base;1\r\n\
\"C:\\a\\b\\two.txt\";456;FEDCBA;Duplicate;Base;2\r\n";

    const SAMPLE_WHOLE_LOT: &str =
        "FilenameAndPath;FileSize;FileSha512Hash;Category;Source;GroupId\r\n\
\"C:\\a\\b\\one.txt\";123;ABCDEF;Duplicate;Base;1\r\n\
\"C:\\x\\y\\one.txt\";123;ABCDEF;Duplicate;Second;1\r\n\
\"C:\\a\\b\\miss.txt\";10;HASH1;Missing;Base;2\r\n\
\"C:\\x\\y\\new.txt\";20;;New;Second;3\r\n\
\"C:\\a\\b\\unique.txt\";30;HASH3;Unique;Base;4\r\n\
\"C:\\a\\b\\changed.txt\";40;HASHA;Changed;Base;5\r\n\
\"C:\\x\\y\\changed.txt\";41;HASHB;Changed;Second;5\r\n\
\"C:\\a\\b\\moved.txt\";50;HASHM;Moved;Base;6\r\n\
\"C:\\x\\y\\zz\\moved.txt\";50;HASHM;Moved;Second;6\r\n";

    #[test]
    fn parses_only_dups() {
        let rows = parse_dup_report_from_reader(Cursor::new(SAMPLE_ONLY_DUPS)).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].filename_and_path, "C:\\a\\b\\one.txt");
        assert_eq!(rows[0].file_size, 123);
        assert_eq!(rows[0].category, Category::Duplicate);
        assert_eq!(rows[0].source, Source::Base);
        assert_eq!(rows[0].group_id, 1);
    }

    #[test]
    fn parses_whole_lot_all_categories() {
        let rows = parse_dup_report_from_reader(Cursor::new(SAMPLE_WHOLE_LOT)).unwrap();
        assert_eq!(rows.len(), 9);
        let cats: std::collections::HashSet<_> = rows.iter().map(|r| r.category).collect();
        assert!(cats.contains(&Category::Duplicate));
        assert!(cats.contains(&Category::Missing));
        assert!(cats.contains(&Category::New));
        assert!(cats.contains(&Category::Unique));
        assert!(cats.contains(&Category::Changed));
        assert!(cats.contains(&Category::Moved));
    }

    #[test]
    fn rejects_check_report() {
        let data = "# myDupFinder check report v1\r\n# Key=Value\r\nCategory,PathMoved\r\n";
        let res = parse_dup_report_from_reader(Cursor::new(data.as_bytes().to_vec()));
        assert!(matches!(res, Err(AppError::Unsupported(_))));
    }

    #[test]
    fn rejects_wrong_header() {
        let data = "Foo;Bar\r\n";
        let res = parse_dup_report_from_reader(Cursor::new(data.as_bytes().to_vec()));
        assert!(matches!(res, Err(AppError::InvalidReport(_))));
    }

    #[test]
    fn parses_only_dups_fixture() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("testdata")
            .join("Demo DiffFindOnlyDups dupReport.csv");
        let rows = parse_dup_report(&path).expect("fixture must parse");
        assert!(!rows.is_empty());
        assert!(rows.iter().all(|r| r.category == Category::Duplicate));
        assert!(rows.iter().all(|r| r.source == Source::Base));
    }

    #[test]
    fn parses_whole_lot_fixture() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("testdata")
            .join("Demo DiffFindDupsTheWholeLot dupReport.csv");
        let rows = parse_dup_report(&path).expect("fixture must parse");
        assert!(!rows.is_empty());
        let has_second = rows.iter().any(|r| r.source == Source::Second);
        assert!(has_second);
    }

    #[test]
    fn job_name_extracted() {
        let p = Path::new("/tmp/Foo Bar dupReport.csv");
        assert_eq!(job_name_from_path(p), "Foo Bar");
    }

    #[test]
    fn streaming_reports_progress_at_least_once() {
        // Build a synthetic CSV with enough rows to trigger one progress tick
        // and the final tick.
        let mut data = String::from(EXPECTED_HEADER);
        data.push_str("\r\n");
        let row_count = PROGRESS_INTERVAL + 7;
        for i in 0..row_count {
            data.push_str(&format!(
                "\"C:\\a\\b\\f{}.txt\";{};HASH{};Unique;Base;{}\r\n",
                i,
                i as i64,
                i,
                i + 1
            ));
        }

        let snapshots: RefCell<Vec<ParseProgress>> = RefCell::new(Vec::new());
        let rows = parse_dup_report_streaming(Cursor::new(data), None, |p| {
            snapshots.borrow_mut().push(p);
        })
        .unwrap();

        assert_eq!(rows.len(), row_count);
        let snaps = snapshots.into_inner();
        // One mid-stream tick at PROGRESS_INTERVAL rows + one final tick at row_count.
        assert!(
            snaps.len() >= 2,
            "expected ≥2 progress ticks, got {:?}",
            snaps
        );
        assert_eq!(snaps.first().unwrap().rows_read, PROGRESS_INTERVAL);
        assert_eq!(snaps.last().unwrap().rows_read, row_count);
        // bytes_read should be monotonically non-decreasing.
        let mut prev = 0u64;
        for s in &snaps {
            assert!(s.bytes_read >= prev);
            prev = s.bytes_read;
        }
    }

    #[test]
    fn streaming_passes_total_bytes_through() {
        let data = SAMPLE_ONLY_DUPS.as_bytes().to_vec();
        let total = data.len() as u64;
        let last: RefCell<Option<ParseProgress>> = RefCell::new(None);
        parse_dup_report_streaming(Cursor::new(data), Some(total), |p| {
            *last.borrow_mut() = Some(p);
        })
        .unwrap();
        let p = last.into_inner().expect("at least one progress tick");
        assert_eq!(p.total_bytes, Some(total));
    }
}
