//! Explorer-only Space hook — does not steal Space from other apps.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::thread;

use tauri::{AppHandle, Manager};
use windows::Win32::Foundation::{HINSTANCE, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::VK_SPACE;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetForegroundWindow, GetMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN,
    WM_SYSKEYDOWN,
};

use super::super::platform;
use super::super::service;
use super::super::window::is_preview_visible;
use super::super::PREVIEW_WINDOW_LABEL;

static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();
static SPACE_DOWN: AtomicBool = AtomicBool::new(false);

const LLKHF_UP: u32 = 0x0080;

/// Reset the Space key-down latch.
///
/// When the preview window closes via Esc or the close button, `restore_file_manager_focus`
/// force-switches foreground back to Explorer. If the user is still holding Space (or the
/// key-up is swallowed by the focus switch), the hook never sees `WM_KEYUP`, leaving
/// `SPACE_DOWN` latched `true`. The next Space press is then swallowed by the dedupe guard,
/// so the user must press Space twice. Call this on every hide to clear the latch.
pub fn reset_space_state() {
    SPACE_DOWN.store(false, Ordering::SeqCst);
}

pub fn register(app: &AppHandle) -> Result<(), String> {
    platform::init_explorer_com_worker()?;

    APP_HANDLE
        .set(app.clone())
        .map_err(|_| "Space preview hook 已注册".to_string())?;

    thread::Builder::new()
        .name("space-preview-hook".into())
        .spawn(|| {
            if let Err(error) = run_hook_thread() {
                eprintln!("[space-preview] keyboard hook failed: {error}");
            }
        })
        .map_err(|error| format!("启动 Space preview 键盘钩子失败: {error}"))?;

    Ok(())
}

fn run_hook_thread() -> Result<(), String> {
    unsafe {
        let module = GetModuleHandleW(None)
            .map_err(|error| format!("GetModuleHandleW 失败: {error}"))?;

        let hook = SetWindowsHookExW(
            WH_KEYBOARD_LL,
            Some(keyboard_hook_proc),
            Some(HINSTANCE(module.0)),
            0,
        )
            .map_err(|error| format!("SetWindowsHookExW 失败: {error}"))?;

        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }

        let _ = UnhookWindowsHookEx(hook);
    }

    Ok(())
}

unsafe extern "system" fn keyboard_hook_proc(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if code >= 0 {
        if let Some(action) = handle_space_event(wparam, lparam) {
            return action;
        }
    }

    CallNextHookEx(None, code, wparam, lparam)
}

unsafe fn handle_space_event(wparam: WPARAM, lparam: LPARAM) -> Option<LRESULT> {
    let keyboard = *(lparam.0 as *const KBDLLHOOKSTRUCT);
    if keyboard.vkCode != VK_SPACE.0 as u32 {
        return None;
    }

    let is_key_up = (keyboard.flags.0 & LLKHF_UP) != 0;
    if is_key_up {
        SPACE_DOWN.store(false, Ordering::SeqCst);
        return None;
    }

    let message = wparam.0 as u32;
    if message != WM_KEYDOWN && message != WM_SYSKEYDOWN {
        return None;
    }

    if SPACE_DOWN.swap(true, Ordering::SeqCst) {
        return None;
    }

    let Some(app) = APP_HANDLE.get() else {
        return None;
    };

    if is_app_window_foreground(app) {
        return None;
    }

    if !platform::explorer_accepts_space_preview() {
        return None;
    }

    if !space_preview_will_handle(app) {
        return None;
    }

    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        if let Err(error) = service::toggle(&app_handle) {
            eprintln!("[space-preview] toggle failed: {error}");
        }
    });

    Some(LRESULT(1))
}

/// Only consume Space when preview will actually open, close, or switch files.
fn space_preview_will_handle(app: &AppHandle) -> bool {
    if is_preview_visible(app) {
        return true;
    }

    !platform::cached_file_manager_selection().is_empty()
}

fn is_app_window_foreground(app: &AppHandle) -> bool {
    let foreground = unsafe { GetForegroundWindow() };
    if foreground.0.is_null() {
        return false;
    }

    for label in ["main", PREVIEW_WINDOW_LABEL] {
        let Some(window) = app.get_webview_window(label) else {
            continue;
        };
        let Ok(hwnd) = window.hwnd() else {
            continue;
        };
        if foreground == hwnd {
            if label == PREVIEW_WINDOW_LABEL && !is_preview_visible(app) {
                continue;
            }
            return true;
        }
    }

    false
}
