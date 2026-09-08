//! Space-preview daemon — cross-platform shell for Explorer/Finder quick preview.
//!
//! macOS production Quick Look remains the `.appex` under `quicklook/`.
//! This module is the Tauri-based path used to reach parity on Windows.
//!
//! ## Platform split
//! - Shared: preview window, VisionScope web UI, toggle/show/hide commands
//! - `platform/macos.rs`: Finder selection via AppleScript (dev / PoC testing)
//! - `platform/windows.rs`: Explorer selection via Shell COM + Explorer-only Space hook

mod commands;
mod platform;
mod service;
mod shortcut;
mod window;

pub use commands::{
    preview_get_selection, preview_hide, preview_pull_load, preview_show_file, preview_toggle,
    preview_window_ready,
};
pub use shortcut::register_space_preview_shortcut;
pub use window::ensure_preview_window;

use std::sync::Mutex;

/// Shared state for the floating space-preview window.
#[derive(Default)]
pub struct PreviewService {
    pub current_path: Mutex<Option<String>>,
    pub pending_load: Mutex<Option<PreviewLoadPayload>>,
    pub web_ready: Mutex<bool>,
}

/// Webview label for the floating preview window.
pub const PREVIEW_WINDOW_LABEL: &str = "space-preview";

/// Wake-up event for the preview webview — payload is pulled via `preview_pull_load`.
pub const PREVIEW_LOAD_EVENT: &str = "preview-load";

#[derive(Clone, serde::Serialize)]
pub struct PreviewLoadPayload {
    pub path: String,
    pub filename: String,
}

impl PreviewLoadPayload {
    pub fn from_path(path: impl Into<String>) -> Self {
        let path = path.into();
        let filename = std::path::Path::new(&path)
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("")
            .to_string();
        Self { path, filename }
    }
}
