mod commands;
mod csv_parser;
mod error;
mod identical;
mod model;
mod query;
mod state;

use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::open_report,
            commands::list_report_rows,
            commands::find_identical_folders_cmd,
            commands::close_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
