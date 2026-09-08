use std::sync::Mutex;

use tauri::Manager;

mod preview;

use preview::{
    ensure_preview_window, preview_get_selection, preview_hide, preview_pull_load,
    preview_show_file, preview_toggle, preview_window_ready, register_space_preview_shortcut,
    PreviewService,
};

/// 保存启动时通过文件关联传入的初始文件路径
struct InitialPath(Mutex<Option<String>>);

/// 读取本地文件字节，返回 Vec<u8>（前端会转成 blob URL 喂给 SDK）。
///
/// 关键：必须是 `async fn`，否则 Tauri 会把同步命令放到主线程执行，
/// `std::fs::read` 读取大文件时会阻塞主线程，导致前端 loading 遮罩
/// 来不及渲染，表现为「点击打开后界面卡死、无任何 loading 动画」。
/// 改成 async 后，读取在异步运行时（非主线程）执行，前端保持响应。
#[tauri::command]
async fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || std::fs::read(&path))
        .await
        .map_err(|e| format!("读取文件任务失败: {e}"))?
        .map_err(|e| format!("读取文件失败: {e}"))
}

#[tauri::command]
async fn stat_file(path: String) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::metadata(&path)
            .map(|meta| meta.len())
            .map_err(|e| format!("读取文件信息失败: {e}"))
    })
    .await
    .map_err(|e| format!("读取文件信息任务失败: {e}"))?
}

/// 打开系统文件选择框，返回用户选择的路径
#[tauri::command]
async fn pick_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = app.dialog().file().blocking_pick_file();
    Ok(picked.and_then(|p| p.into_path().ok().map(|pb| pb.to_string_lossy().to_string())))
}

/// 返回启动时通过文件关联传入的初始文件路径（若存在）
#[tauri::command]
fn get_initial_file_path(state: tauri::State<'_, InitialPath>) -> Option<String> {
    state.0.lock().unwrap().clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(InitialPath(Mutex::new(None)))
        .manage(PreviewService::default())
        .setup(|app| {
            // 读取启动参数：文件关联（双击文件）时，路径会出现在 argv 中
            let args: Vec<String> = std::env::args().collect();
            if let Some(path) = args
                .iter()
                .skip(1)
                .find(|a| !a.starts_with('-') && std::path::Path::new(a).exists())
            {
                let state = app.state::<InitialPath>();
                *state.0.lock().unwrap() = Some(path.clone());
            }

            if let Err(error) = register_space_preview_shortcut(app.handle()) {
                eprintln!("[space-preview] shortcut registration skipped: {error}");
            }

            // Pre-create the hidden preview window at app startup so that the
            // WebView2 process, the 18 MB JS bundle, and WASM modules are
            // already parsed/compiled by the time the user triggers the first
            // Space preview.  On Windows this eliminates the ~30 s cold-start
            // delay; on macOS the .appex path is unaffected.
            if let Err(error) = ensure_preview_window(app.handle()) {
                eprintln!("[space-preview] pre-warm window skipped: {error}");
            }

            // 在 debug 模式下自动打开开发者工具
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_file_bytes,
            stat_file,
            pick_file,
            get_initial_file_path,
            preview_show_file,
            preview_hide,
            preview_toggle,
            preview_get_selection,
            preview_window_ready,
            preview_pull_load,
        ])
        .run(tauri::generate_context!())
        .expect("error while running VisionScope");
}
