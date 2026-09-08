//! File-manager integration — the platform-specific boundary for space preview.

use std::path::PathBuf;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

/// Returns `true` when the OS file manager is the frontmost application.
///
/// Space preview should only activate in this context (v1 scope).
pub fn is_file_manager_frontmost() -> bool {
    platform_impl::is_file_manager_frontmost()
}

/// Selected file paths from the frontmost file-manager window.
///
/// v1: first path only is used by the preview service.
pub fn get_file_manager_selection() -> Result<Vec<PathBuf>, String> {
    platform_impl::get_file_manager_selection()
}

/// Returns `true` when Space should open preview in the file manager (Windows only).
#[cfg(target_os = "windows")]
pub fn explorer_accepts_space_preview() -> bool {
    platform_impl::explorer_accepts_space_preview()
}

/// Latest polled selection — safe for the keyboard hook (no COM).
#[cfg(target_os = "windows")]
pub fn cached_file_manager_selection() -> Vec<PathBuf> {
    platform_impl::cached_file_manager_selection()
}

/// Start the Explorer COM worker thread (Windows only).
#[cfg(target_os = "windows")]
pub fn init_explorer_com_worker() -> Result<(), String> {
    platform_impl::init_explorer_com_worker()
}

/// Best-effort focus restore for Explorer after preview closes (Windows only).
#[cfg(target_os = "windows")]
pub fn restore_file_manager_focus() {
    platform_impl::restore_file_manager_focus();
}

#[cfg(not(target_os = "windows"))]
pub fn cached_file_manager_selection() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(not(target_os = "windows"))]
pub fn restore_file_manager_focus() {}

#[cfg(target_os = "macos")]
mod platform_impl {
    pub use super::macos::{get_file_manager_selection, is_file_manager_frontmost};
}

#[cfg(target_os = "windows")]
mod platform_impl {
    pub use super::windows::{
        cached_file_manager_selection, explorer_accepts_space_preview, get_file_manager_selection,
        init_explorer_com_worker, is_file_manager_frontmost, restore_file_manager_focus,
    };
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform_impl {
    use super::PathBuf;

    pub fn is_file_manager_frontmost() -> bool {
        false
    }

    pub fn get_file_manager_selection() -> Result<Vec<PathBuf>, String> {
        Ok(Vec::new())
    }
}
