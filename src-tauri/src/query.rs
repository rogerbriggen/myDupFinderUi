use crate::model::{Row, RowPage, RowQuery};

/// In-memory filter + paginate over a slice of rows.
pub fn list_rows(rows: &[Row], query: &RowQuery) -> RowPage {
    let folder_filter = query.folder.as_deref().filter(|s| !s.is_empty());
    let text_filter = query.text.as_deref().map(str::to_ascii_lowercase);
    let hash_filter = query.hash.as_deref().map(str::to_ascii_uppercase);
    let cats = query.categories.as_deref();
    let sources = query.sources.as_deref();

    let filtered: Vec<&Row> = rows
        .iter()
        .filter(|r| {
            if let Some(folder) = folder_filter {
                if query.include_descendants {
                    if !is_under_or_equal(&r.filename_and_path, folder) {
                        return false;
                    }
                } else {
                    let (rf, _) = crate::model::split_folder_and_name(&r.filename_and_path);
                    if rf != folder {
                        return false;
                    }
                }
            }
            if let Some(text) = &text_filter {
                if !r.filename_and_path.to_ascii_lowercase().contains(text) {
                    return false;
                }
            }
            if let Some(hash) = &hash_filter {
                let row_hash = r.file_sha512_hash.to_ascii_uppercase();
                if hash.len() >= 8 {
                    if !row_hash.starts_with(hash.as_str()) {
                        return false;
                    }
                } else if row_hash != *hash {
                    return false;
                }
            }
            if let Some(cats) = cats {
                if !cats.contains(&r.category) {
                    return false;
                }
            }
            if let Some(srcs) = sources {
                if !srcs.contains(&r.source) {
                    return false;
                }
            }
            true
        })
        .collect();

    let total = filtered.len();
    let offset = query.offset.min(total);
    let end = (offset + query.limit.max(1)).min(total);
    let page: Vec<Row> = filtered[offset..end].iter().map(|r| (*r).clone()).collect();

    RowPage {
        rows: page,
        total,
        offset,
    }
}

fn is_under_or_equal(path: &str, folder: &str) -> bool {
    if folder.is_empty() {
        return true;
    }
    if path == folder {
        return true;
    }
    if !path.starts_with(folder) {
        return false;
    }
    let next = &path[folder.len()..];
    next.starts_with('\\') || next.starts_with('/')
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Category, Source};

    fn r(path: &str, cat: Category, src: Source, gid: i32, size: i64, hash: &str) -> Row {
        Row {
            filename_and_path: path.to_string(),
            file_size: size,
            file_sha512_hash: hash.to_string(),
            category: cat,
            source: src,
            group_id: gid,
        }
    }

    fn sample() -> Vec<Row> {
        vec![
            r(
                "C:\\a\\one.txt",
                Category::Duplicate,
                Source::Base,
                1,
                10,
                "ABCDEF12",
            ),
            r(
                "C:\\a\\b\\two.txt",
                Category::Moved,
                Source::Base,
                2,
                20,
                "11223344",
            ),
            r(
                "C:\\a\\b\\three.txt",
                Category::Unique,
                Source::Base,
                3,
                30,
                "55667788",
            ),
            r(
                "D:\\x\\foo.txt",
                Category::Duplicate,
                Source::Second,
                1,
                10,
                "ABCDEF12",
            ),
        ]
    }

    #[test]
    fn folder_filter_immediate_children_only() {
        let rows = sample();
        let q = RowQuery {
            folder: Some("C:\\a".to_string()),
            include_descendants: false,
            limit: 100,
            ..Default::default()
        };
        let page = list_rows(&rows, &q);
        assert_eq!(page.total, 1);
        assert_eq!(page.rows[0].filename_and_path, "C:\\a\\one.txt");
    }

    #[test]
    fn folder_filter_descendants() {
        let rows = sample();
        let q = RowQuery {
            folder: Some("C:\\a".to_string()),
            include_descendants: true,
            limit: 100,
            ..Default::default()
        };
        let page = list_rows(&rows, &q);
        assert_eq!(page.total, 3);
    }

    #[test]
    fn category_filter() {
        let rows = sample();
        let q = RowQuery {
            categories: Some(vec![Category::Unique]),
            limit: 100,
            ..Default::default()
        };
        let page = list_rows(&rows, &q);
        assert_eq!(page.total, 1);
        assert_eq!(page.rows[0].category, Category::Unique);
    }

    #[test]
    fn text_filter_case_insensitive() {
        let rows = sample();
        let q = RowQuery {
            text: Some("THREE".to_string()),
            limit: 100,
            ..Default::default()
        };
        let page = list_rows(&rows, &q);
        assert_eq!(page.total, 1);
    }

    #[test]
    fn hash_prefix_filter() {
        let rows = sample();
        let q = RowQuery {
            hash: Some("ABCDEF12".to_string()),
            limit: 100,
            ..Default::default()
        };
        let page = list_rows(&rows, &q);
        assert_eq!(page.total, 2);
    }

    #[test]
    fn empty_category_list_matches_nothing() {
        let rows = sample();
        let q = RowQuery {
            categories: Some(vec![]),
            limit: 100,
            ..Default::default()
        };
        let page = list_rows(&rows, &q);
        assert_eq!(page.total, 0);
    }

    #[test]
    fn empty_source_list_matches_nothing() {
        let rows = sample();
        let q = RowQuery {
            sources: Some(vec![]),
            limit: 100,
            ..Default::default()
        };
        let page = list_rows(&rows, &q);
        assert_eq!(page.total, 0);
    }

    #[test]
    fn pagination() {
        let rows = sample();
        let q = RowQuery {
            offset: 1,
            limit: 2,
            ..Default::default()
        };
        let page = list_rows(&rows, &q);
        assert_eq!(page.total, 4);
        assert_eq!(page.rows.len(), 2);
        assert_eq!(page.offset, 1);
    }
}
