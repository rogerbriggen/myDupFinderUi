use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("CSV parse error: {0}")]
    Csv(#[from] csv::Error),

    #[error("Unsupported file: {0}")]
    Unsupported(String),

    #[error("Invalid report: {0}")]
    InvalidReport(String),

    #[error("Unknown report handle: {0}")]
    UnknownHandle(u64),
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum AppErrorDto {
    Io(String),
    Csv(String),
    Unsupported(String),
    InvalidReport(String),
    UnknownHandle(String),
}

impl From<AppError> for AppErrorDto {
    fn from(err: AppError) -> Self {
        match err {
            AppError::Io(e) => AppErrorDto::Io(e.to_string()),
            AppError::Csv(e) => AppErrorDto::Csv(e.to_string()),
            AppError::Unsupported(m) => AppErrorDto::Unsupported(m),
            AppError::InvalidReport(m) => AppErrorDto::InvalidReport(m),
            AppError::UnknownHandle(id) => AppErrorDto::UnknownHandle(id.to_string()),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let dto: AppErrorDto = match self {
            AppError::Io(e) => AppErrorDto::Io(e.to_string()),
            AppError::Csv(e) => AppErrorDto::Csv(e.to_string()),
            AppError::Unsupported(m) => AppErrorDto::Unsupported(m.clone()),
            AppError::InvalidReport(m) => AppErrorDto::InvalidReport(m.clone()),
            AppError::UnknownHandle(id) => AppErrorDto::UnknownHandle(id.to_string()),
        };
        dto.serialize(serializer)
    }
}

pub type AppResult<T> = std::result::Result<T, AppError>;
