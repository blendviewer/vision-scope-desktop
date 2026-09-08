use tauri::{AppHandle, Manager};

use super::service;
use super::window;
use super::PreviewService;

/// Mock / dev entry — open preview for an explicit filesystem path.
#[tauri::command]
pub fn preview_show_file(app: AppHandle, path: String) -> Result<(), String> {
    service::show_file(&app, &path)
}

/// Hide the floating preview window.
#[tauri::command]
pub fn preview_hide(app: AppHandle) -> Result<(), String> {
    service::hide(&app)
}

/// Toggle preview using the platform file-manager selection API.
#[tauri::command]
pub fn preview_toggle(app: AppHandle) -> Result<(), String> {
    service::toggle(&app)
}

/// Debug helper — returns selected paths from Finder/Explorer.
#[tauri::command]
pub fn preview_get_selection() -> Result<Vec<String>, String> {
    service::get_selection()
}

/// Called by the preview webview once its JS bundle is ready to receive loads.
#[tauri::command]
pub fn preview_window_ready(app: AppHandle) -> Result<(), String> {
    {
        let service = app.state::<PreviewService>();
        *service.web_ready.lock().unwrap() = true;
    }

    window::trigger_preview_pull(&app)
}

/// Pull the pending preview payload (single-use; cleared after dispatch).
#[tauri::command]
pub fn preview_pull_load(state: tauri::State<PreviewService>) -> Option<super::PreviewLoadPayload> {
    state.pending_load.lock().unwrap().take()
}
