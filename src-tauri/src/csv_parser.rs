use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::Path;

use csv::ReaderBuilder;

use crate::error::{AppError, AppResult};
use crate::model::{Category, Row, Source};

pub const EXPECTED_HEADER: &str =
    "FilenameAndPath;FileSize;FileSha512Hash;Category;Source;GroupId";

pub const CHECK_REPORT_MARKER: &str = "# myDupFinder check report";

/// Parse a dupReport CSV file from disk.
pub fn parse_dup_report(path: &Path) -> AppResult<Vec<Row>> {
    let mut file = std::fs::File::open(path)?;
    sniff_and_validate(&mut file)?;
    file.seek(SeekFrom::Start(0))?;
    parse_dup_report_from_reader(file)
}

/// Validate the file format. Errors with `Unsupported` for the check-report
/// sibling format, or `InvalidReport` if the header is wrong.
fn sniff_and_validate<R: Read + Seek>(reader: &mut R) -> AppResult<()> {
    let mut buf_reader = BufReader::new(reader);
    let mut first_line = String::new();
    buf_reader.read_line(&mut first_line)?;
    let trimmed = first_line.trim_end_matches(['\r', '\n']);

    if trimmed.starts_with(CHECK_REPORT_MARKER) {
        return Err(AppError::Unsupported(
            "myDupFinder check reports are not supported yet.".into(),
        ));
    }

    if trimmed != EXPECTED_HEADER {
        return Err(AppError::InvalidReport(format!(
            "Unexpected CSV header. Expected: '{}', got: '{}'",
            EXPECTED_HEADER, trimmed
        )));
    }
    Ok(())
}

/// Parse from any `Read`. Used in tests with in-memory data.
pub fn parse_dup_report_from_reader<R: Read>(reader: R) -> AppResult<Vec<Row>> {
    let mut rdr = ReaderBuilder::new()
        .delimiter(b';')
        .quote(b'"')
        .has_headers(true)
        .flexible(false)
        .from_reader(reader);

    let headers = rdr.headers()?.clone();
    let actual_header = headers
        .iter()
        .collect::<Vec<_>>()
        .join(";");
    if actual_header != EXPECTED_HEADER {
        return Err(AppError::InvalidReport(format!(
            "Unexpected CSV header: '{}'",
            actual_header
        )));
    }

    let mut rows = Vec::new();
    for (line_no, rec) in rdr.records().enumerate() {
        let rec = rec?;
        if rec.len() != 6 {
            return Err(AppError::InvalidReport(format!(
                "Row {} has {} fields, expected 6",
                line_no + 2,
                rec.len()
            )));
        }
        let filename_and_path = rec[0].to_string();
        let file_size = rec[1].parse::<i64>().map_err(|e| {
            AppError::InvalidReport(format!("Row {}: invalid FileSize: {}", line_no + 2, e))
        })?;
        let file_sha512_hash = rec[2].to_string();
        let category = Category::parse(&rec[3]).ok_or_else(|| {
            AppError::InvalidReport(format!("Row {}: unknown Category '{}'", line_no + 2, &rec[3]))
        })?;
        let source = Source::parse(&rec[4]).ok_or_else(|| {
            AppError::InvalidReport(format!("Row {}: unknown Source '{}'", line_no + 2, &rec[4]))
        })?;
        let group_id = rec[5].parse::<i32>().map_err(|e| {
            AppError::InvalidReport(format!("Row {}: invalid GroupId: {}", line_no + 2, e))
        })?;

        rows.push(Row {
            filename_and_path,
            file_size,
            file_sha512_hash,
            category,
            source,
            group_id,
        });
    }
    Ok(rows)
}

/// Extract `<JobName>` from `"<JobName> dupReport.csv"`.
pub fn job_name_from_path(path: &Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    stem.strip_suffix(" dupReport").unwrap_or(stem).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    const SAMPLE_ONLY_DUPS: &str = "FilenameAndPath;FileSize;FileSha512Hash;Category;Source;GroupId\r\n\
\"C:\\a\\b\\one.txt\";123;ABCDEF;Duplicate;Base;1\r\n\
\"C:\\a\\b\\two.txt\";456;FEDCBA;Duplicate;Base;2\r\n";

    const SAMPLE_WHOLE_LOT: &str = "FilenameAndPath;FileSize;FileSha512Hash;Category;Source;GroupId\r\n\
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
        let mut cursor = Cursor::new(data.as_bytes().to_vec());
        let res = sniff_and_validate(&mut cursor);
        assert!(matches!(res, Err(AppError::Unsupported(_))));
    }

    #[test]
    fn rejects_wrong_header() {
        let data = "Foo;Bar\r\n";
        let mut cursor = Cursor::new(data.as_bytes().to_vec());
        let res = sniff_and_validate(&mut cursor);
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
}
