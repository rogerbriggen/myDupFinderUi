use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::csv_parser::{job_name_from_path, parse_dup_report_with_progress};
use crate::error::{AppError, AppResult};
use crate::identical::find_identical_folders;
use crate::model::{IdenticalFolderPair, ReportHandle, RowPage, RowQuery, Source};
use crate::query::list_rows;
use crate::state::{AppState, Report};

/// Tauri event name for streaming-parse progress. The frontend subscribes via
/// `@tauri-apps/api/event::listen("report-progress", …)`.
pub const REPORT_PROGRESS_EVENT: &str = "report-progress";

/// Payload emitted on the `report-progress` channel during a streaming parse.
/// Field names match the camelCase convention used elsewhere on the wire.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportProgressEvent {
    pub phase: &'static str,
    pub rows_read: usize,
    pub bytes_read: u64,
    pub total_bytes: Option<u64>,
}

#[tauri::command]
pub fn open_report(
    app: AppHandle,
    path: String,
    state: State<'_, AppState>,
) -> AppResult<ReportHandle> {
    let p = PathBuf::from(&path);
    let rows = parse_dup_report_with_progress(&p, |progress| {
        // Best-effort: a failed emit must not abort the parse. The frontend
        // will fall back to the synchronous `open_report` resolution.
        let _ = app.emit(
            REPORT_PROGRESS_EVENT,
            ReportProgressEvent {
                phase: "parsing",
                rows_read: progress.rows_read,
                bytes_read: progress.bytes_read,
                total_bytes: progress.total_bytes,
            },
        );
    })?;
    let row_count = rows.len();
    let job_name = job_name_from_path(&p);
    let has_second_source = rows.iter().any(|r| r.source == Source::Second);
    let _ = app.emit(
        REPORT_PROGRESS_EVENT,
        ReportProgressEvent {
            phase: "done",
            rows_read: row_count,
            bytes_read: 0,
            total_bytes: None,
        },
    );
    let id = state.insert(Report {
        job_name: job_name.clone(),
        rows,
    });
    Ok(ReportHandle {
        id,
        row_count,
        job_name,
        has_second_source,
    })
}

#[tauri::command]
pub fn list_report_rows(
    handle: u64,
    query: RowQuery,
    state: State<'_, AppState>,
) -> AppResult<RowPage> {
    state
        .with_report(handle, |report| list_rows(&report.rows, &query))
        .ok_or(AppError::UnknownHandle(handle))
}

#[tauri::command]
pub fn find_identical_folders_cmd(
    handle: u64,
    state: State<'_, AppState>,
) -> AppResult<Vec<IdenticalFolderPair>> {
    state
        .with_report(handle, |report| find_identical_folders(&report.rows))
        .ok_or(AppError::UnknownHandle(handle))
}

#[tauri::command]
pub fn close_report(handle: u64, state: State<'_, AppState>) -> AppResult<()> {
    if !state.remove(handle) {
        return Err(AppError::UnknownHandle(handle));
    }
    Ok(())
}
