use tauri::{AppHandle, Emitter, EventTarget, Manager, WebviewUrl, WebviewWindowBuilder};

use super::{PreviewLoadPayload, PreviewService, PREVIEW_LOAD_EVENT, PREVIEW_WINDOW_LABEL};

fn escape_js_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\r', "\\r")
        .replace('\n', "\\n")
        .replace('\u{2028}', "\\u2028")
        .replace('\u{2029}', "\\u2029")
}

/// Default preview window size — matches the most common `previewLayout`
/// (1280×720, 16:9) from `preview-registry.json`.
///
/// The JS side (`adjustWindowSize` in `preview-core.js`) reads the per-extension
/// `previewLayout` and calls `setSize` + `center` on load, so this is only the
/// initial / fallback size before the first file is loaded.
const PREVIEW_WIDTH: f64 = 1280.0;
const PREVIEW_HEIGHT: f64 = 720.0;

pub fn ensure_preview_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        return Ok(window);
    }

    let window = WebviewWindowBuilder::new(
        app,
        PREVIEW_WINDOW_LABEL,
        WebviewUrl::App("preview.html".into()),
    )
    .title("VisionScope Preview")
    .decorations(false)
    .always_on_top(true)
    .visible(false)
    .skip_taskbar(true)
    .resizable(true)
    .inner_size(PREVIEW_WIDTH, PREVIEW_HEIGHT)
    .center()
    .build()
    .map_err(|error| format!("创建预览窗口失败: {error}"))?;

    #[cfg(debug_assertions)]
    {
        let _ = window.open_devtools();
    }

    Ok(window)
}

pub fn show_preview_file(app: &AppHandle, path: &str) -> Result<(), String> {
    let payload = PreviewLoadPayload::from_path(path.to_string());
    let window = ensure_preview_window(app)?;

    {
        let service = app.state::<PreviewService>();
        *service.current_path.lock().unwrap() = Some(path.to_string());
    }

    window
        .show()
        .map_err(|error| format!("显示预览窗口失败: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("聚焦预览窗口失败: {error}"))?;

    eprintln!(
        "[space-preview] show file: path={path} web_ready={}",
        *app.state::<PreviewService>().web_ready.lock().unwrap()
    );

    dispatch_load(app, payload)
}

pub fn hide_preview(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        window
            .hide()
            .map_err(|error| format!("隐藏预览窗口失败: {error}"))?;
    }

    // Clear the Space key-down latch before restoring focus. On Windows, Esc / close-button
    // dismissal force-switches foreground back to Explorer while the user may still be holding
    // Space; without this, the hook never sees the key-up and latches SPACE_DOWN, forcing the
    // next Space press to be swallowed (the "press Space twice" bug).
    super::shortcut::reset_space_state();

    super::platform::restore_file_manager_focus();

    let service = app.state::<PreviewService>();
    *service.current_path.lock().unwrap() = None;
    *service.pending_load.lock().unwrap() = None;
    Ok(())
}

pub fn is_preview_visible(app: &AppHandle) -> bool {
    app.get_webview_window(PREVIEW_WINDOW_LABEL)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

pub fn dispatch_load(app: &AppHandle, payload: PreviewLoadPayload) -> Result<(), String> {
    let service = app.state::<PreviewService>();

    {
        let mut pending = service.pending_load.lock().unwrap();
        *pending = Some(payload.clone());
    }

    if *service.web_ready.lock().unwrap() {
        trigger_preview_pull(app)?;
    }

    Ok(())
}

/// Notify preview webview and dispatch the pending payload directly into JS.
pub fn trigger_preview_pull(app: &AppHandle) -> Result<(), String> {
    let payload = {
        let service = app.state::<PreviewService>();
        let taken = service.pending_load.lock().unwrap().take();
        taken
    };

    let Some(payload) = payload else {
        return Ok(());
    };

    if let Some(window) = app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        let path = escape_js_string(&payload.path);
        let filename = escape_js_string(&payload.filename);
        let script = format!(
            "void globalThis.__visionScopeLoadPreview?.({{path:'{path}',filename:'{filename}'}})"
        );
        if let Err(error) = window.eval(&script) {
            eprintln!("[space-preview] direct load eval failed: {error}");
            app.state::<PreviewService>()
                .pending_load
                .lock()
                .unwrap()
                .replace(payload);
            notify_pending_load(app)?;
        }
    }

    Ok(())
}

/// Notify the preview webview that a payload is waiting; JS pulls via `preview_pull_load`.
pub fn notify_pending_load(app: &AppHandle) -> Result<(), String> {
    let has_pending = app
        .state::<PreviewService>()
        .pending_load
        .lock()
        .unwrap()
        .is_some();

    if !has_pending {
        return Ok(());
    }

    app.emit_to(
        EventTarget::webview_window(PREVIEW_WINDOW_LABEL),
        PREVIEW_LOAD_EVENT,
        (),
    )
    .map_err(|error| format!("发送 preview-load 事件失败: {error}"))
}

#[allow(dead_code)]
pub fn flush_pending_load(app: &AppHandle) -> Result<(), String> {
    trigger_preview_pull(app)
}
