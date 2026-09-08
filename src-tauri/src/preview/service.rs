use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use super::platform;
use super::window::{hide_preview, is_preview_visible, show_preview_file};
use super::PreviewService;

pub fn show_file(app: &AppHandle, path: &str) -> Result<(), String> {
    if !PathBuf::from(path).is_file() {
        return Err(format!("文件不存在或不是普通文件: {path}"));
    }

    show_preview_file(app, path)
}

pub fn hide(app: &AppHandle) -> Result<(), String> {
    hide_preview(app)
}

fn same_file_path(a: &str, b: &str) -> bool {
    let left = PathBuf::from(a);
    let right = PathBuf::from(b);
    if left == right {
        return true;
    }

    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

/// Explorer 前台按 Space：打开、切换文件，或关闭（已预览同一文件时）。
pub fn toggle(app: &AppHandle) -> Result<(), String> {
    if !platform::is_file_manager_frontmost() {
        return Ok(());
    }

    let selected = {
        #[cfg(target_os = "windows")]
        {
            let cached = platform::cached_file_manager_selection();
            if !cached.is_empty() {
                cached
            } else {
                platform::get_file_manager_selection().unwrap_or_default()
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            platform::get_file_manager_selection()?
        }
    };
    let Some(path) = selected.first() else {
        if is_preview_visible(app) {
            return hide(app);
        }
        return Ok(());
    };

    let path_str = path.to_string_lossy().into_owned();

    if is_preview_visible(app) {
        let current = app.state::<PreviewService>().current_path.lock().unwrap().clone();
        if current.as_deref().is_some_and(|current| same_file_path(current, &path_str)) {
            return hide(app);
        }
        return show_file(app, &path_str);
    }

    show_file(app, &path_str)
}

pub fn get_selection() -> Result<Vec<String>, String> {
    platform::get_file_manager_selection().map(|paths| {
        paths
            .into_iter()
            .map(|path| path.to_string_lossy().into_owned())
            .collect()
    })
}
