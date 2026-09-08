use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

use super::super::service;

/// macOS/Linux PoC — global Space shortcut.
///
/// **Do not register on macOS in production** — see `shortcut/mod.rs`.
pub fn register(app: &AppHandle) -> Result<(), String> {
    app.plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .map_err(|error| format!("global-shortcut 插件初始化失败: {error}"))?;

    let space_shortcut = Shortcut::new(None, Code::Space);
    let app_handle = app.clone();

    app.global_shortcut()
        .on_shortcut(space_shortcut, move |_app, _shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }

            if let Err(error) = service::toggle(&app_handle) {
                eprintln!("[space-preview] toggle failed: {error}");
            }
        })
        .map_err(|error| format!("注册 Space 全局快捷键失败: {error}"))?;

    Ok(())
}
