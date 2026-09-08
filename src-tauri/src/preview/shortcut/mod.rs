//! Space-preview shortcut registration — platform-specific.
//!
//! - **Windows**: low-level keyboard hook, only consumes Space when preview will run
//! - **macOS**: disabled by default — production Quick Look is `.appex`; global Space
//!   steals the key from Finder and breaks native preview when VisionScope is running
//! - **Linux**: global shortcut PoC

#[cfg(any(target_os = "macos", target_os = "linux"))]
mod global;

#[cfg(target_os = "windows")]
mod windows;

/// Enable Tauri space-preview on macOS (dev only). Production uses `VisionScopeQuickLook.appex`.
fn macos_space_preview_enabled() -> bool {
    std::env::var("VISIONSCOPE_SPACE_PREVIEW").as_deref() == Ok("1")
}

#[cfg(target_os = "macos")]
pub fn register_space_preview_shortcut(app: &tauri::AppHandle) -> Result<(), String> {
    if macos_space_preview_enabled() {
        eprintln!("[space-preview] macOS PoC mode (VISIONSCOPE_SPACE_PREVIEW=1)");
        return global::register(app);
    }

    eprintln!(
        "[space-preview] macOS: global Space disabled (native Quick Look uses .appex). \
         Set VISIONSCOPE_SPACE_PREVIEW=1 to test Tauri preview in Finder."
    );
    Ok(())
}

#[cfg(target_os = "linux")]
pub fn register_space_preview_shortcut(app: &tauri::AppHandle) -> Result<(), String> {
    global::register(app)
}

#[cfg(target_os = "windows")]
pub fn register_space_preview_shortcut(app: &tauri::AppHandle) -> Result<(), String> {
    windows::register(app)
}

/// Clear the Space key-down latch (Windows only). Called on preview hide to avoid the
/// "press Space twice" bug after Esc / close-button dismissal.
#[cfg(target_os = "windows")]
pub fn reset_space_state() {
    windows::reset_space_state();
}

#[cfg(not(target_os = "windows"))]
pub fn reset_space_state() {}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub fn register_space_preview_shortcut(_app: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}
