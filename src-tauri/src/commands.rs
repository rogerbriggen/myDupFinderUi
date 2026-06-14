use std::path::PathBuf;

use tauri::State;

use crate::csv_parser::{job_name_from_path, parse_dup_report};
use crate::error::{AppError, AppResult};
use crate::identical::find_identical_folders;
use crate::model::{IdenticalFolderPair, ReportHandle, RowPage, RowQuery, Source};
use crate::query::list_rows;
use crate::state::{AppState, Report};

#[tauri::command]
pub fn open_report(path: String, state: State<'_, AppState>) -> AppResult<ReportHandle> {
    let p = PathBuf::from(&path);
    let rows = parse_dup_report(&p)?;
    let row_count = rows.len();
    let job_name = job_name_from_path(&p);
    let has_second_source = rows.iter().any(|r| r.source == Source::Second);
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
