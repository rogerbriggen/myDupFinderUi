use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Category {
    Duplicate,
    Moved,
    Unique,
    Missing,
    New,
    Changed,
}

impl Category {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "Duplicate" => Some(Category::Duplicate),
            "Moved" => Some(Category::Moved),
            "Unique" => Some(Category::Unique),
            "Missing" => Some(Category::Missing),
            "New" => Some(Category::New),
            "Changed" => Some(Category::Changed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Source {
    Base,
    Second,
}

impl Source {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "Base" => Some(Source::Base),
            "Second" => Some(Source::Second),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Row {
    #[serde(rename = "filenameAndPath")]
    pub filename_and_path: String,
    #[serde(rename = "fileSize")]
    pub file_size: i64,
    #[serde(rename = "fileSha512Hash")]
    pub file_sha512_hash: String,
    pub category: Category,
    pub source: Source,
    #[serde(rename = "groupId")]
    pub group_id: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RowQuery {
    pub folder: Option<String>,
    #[serde(rename = "includeDescendants", default)]
    pub include_descendants: bool,
    pub text: Option<String>,
    pub hash: Option<String>,
    pub categories: Option<Vec<Category>>,
    pub sources: Option<Vec<Source>>,
    #[serde(default)]
    pub offset: usize,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_limit() -> usize {
    1000
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RowPage {
    pub rows: Vec<Row>,
    pub total: usize,
    pub offset: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportHandle {
    pub id: u64,
    #[serde(rename = "rowCount")]
    pub row_count: usize,
    #[serde(rename = "jobName")]
    pub job_name: String,
    #[serde(rename = "hasSecondSource")]
    pub has_second_source: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IdenticalFolderPair {
    #[serde(rename = "folderA")]
    pub folder_a: String,
    #[serde(rename = "folderB")]
    pub folder_b: String,
    #[serde(rename = "fileCount")]
    pub file_count: usize,
    #[serde(rename = "totalSize")]
    pub total_size: i64,
}

/// Split a filename-and-path into (folder, filename).
/// Handles both `\` and `/` separators, since the CSV may carry Windows paths
/// even when the UI runs on another OS.
pub fn split_folder_and_name(path: &str) -> (String, String) {
    let bytes = path.as_bytes();
    let mut last_sep: Option<usize> = None;
    for (i, b) in bytes.iter().enumerate() {
        if *b == b'\\' || *b == b'/' {
            last_sep = Some(i);
        }
    }
    match last_sep {
        Some(i) => (path[..i].to_string(), path[i + 1..].to_string()),
        None => (String::new(), path.to_string()),
    }
}

/// Return the parent folder of a path (everything before the last separator),
/// or `None` if there is no separator.
pub fn parent_of(path: &str) -> Option<String> {
    let (parent, _) = split_folder_and_name(path);
    if parent.is_empty() {
        None
    } else {
        Some(parent)
    }
}
