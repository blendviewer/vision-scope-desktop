//! Windows Explorer integration for space preview (Quick Look parity).
//!
//! Uses Shell COM (`IShellWindows` → `IShellBrowser` → `IShellView`) to read
//! the selected items in the foreground Explorer window when the user presses Space.

#[path = "windows_com_worker.rs"]
mod com_worker;

use std::path::PathBuf;

use windows::core::{Interface, w, HRESULT};
use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, IDispatch, IServiceProvider, CLSCTX_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::System::SystemServices::SFGAO_FILESYSTEM;
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Shell::{
    IShellBrowser, IShellItem, IShellItemArray, IShellWindows, ShellWindows,
    SIGDN_DESKTOPABSOLUTEPARSING, SIGDN_FILESYSPATH, SVGIO_SELECTION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowExW, GetClassNameW, GetForegroundWindow, GetGUIThreadInfo, GetParent,
    GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow, GUITHREADINFO,
};

const EXPLORER_CLASS_NAMES: &[&str] = &["CabinetWClass", "ExploreWClass"];

/// Explorer edit controls where Space should type a character, not open preview.
const BLOCKED_EXPLORER_FOCUS_CLASSES: &[&str] = &["Edit", "ComboBoxEx32", "ComboBox"];

fn is_null_hwnd(hwnd: HWND) -> bool {
    hwnd.0.is_null()
}

/// Returns `true` when the foreground window belongs to File Explorer.
pub fn is_file_manager_frontmost() -> bool {
    let foreground = unsafe { GetForegroundWindow() };
    if is_null_hwnd(foreground) {
        return false;
    }

    find_explorer_root(foreground).is_some()
}

/// Returns `true` when Space should trigger preview in the frontmost Explorer window.
pub fn explorer_accepts_space_preview() -> bool {
    if !is_file_manager_frontmost() {
        return false;
    }

    let Some(focus) = foreground_focus_hwnd() else {
        return true;
    };

    let class_name = window_class_name(focus);
    !BLOCKED_EXPLORER_FOCUS_CLASSES
        .iter()
        .any(|name| class_name == *name)
}

fn foreground_focus_hwnd() -> Option<HWND> {
    let foreground = unsafe { GetForegroundWindow() };
    if is_null_hwnd(foreground) {
        return None;
    }

    let thread_id = unsafe { GetWindowThreadProcessId(foreground, None) };
    if thread_id == 0 {
        return None;
    }

    let mut info = GUITHREADINFO {
        cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
        ..Default::default()
    };

    unsafe {
        GetGUIThreadInfo(thread_id, &mut info).ok()?;
    }

    if is_null_hwnd(info.hwndFocus) {
        None
    } else {
        Some(info.hwndFocus)
    }
}

/// Start the Explorer COM worker thread (required before keyboard hook queries).
pub fn init_explorer_com_worker() -> Result<(), String> {
    com_worker::init()
}

/// Latest polled selection — safe for the keyboard hook (no COM).
pub fn cached_file_manager_selection() -> Vec<PathBuf> {
    com_worker::cached_selection()
}

/// Selected file paths from the foreground Explorer window.
///
/// Returns an empty vector when Explorer is not frontmost or nothing is selected.
/// Uses a live Shell COM query; do not call from the keyboard hook.
pub fn get_file_manager_selection() -> Result<Vec<PathBuf>, String> {
    if !is_file_manager_frontmost() {
        return Ok(Vec::new());
    }

    let foreground = unsafe { GetForegroundWindow() };
    let hwnd_candidates = explorer_hwnd_candidates(foreground);

    com_init()?;
    unsafe { query_explorer_selection_inner(&hwnd_candidates) }
}

pub(crate) fn com_init() -> Result<(), String> {
    let hr = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    if hr.is_ok() || hr == HRESULT(-2147417850) {
        // S_OK or RPC_E_CHANGED_MODE — proceed; WebView2 may already own COM on this thread.
        Ok(())
    } else {
        Err(format!("COM 初始化失败: {hr:?}"))
    }
}

fn window_class_name(hwnd: HWND) -> String {
    let mut buffer = [0u16; 256];
    let len = unsafe { GetClassNameW(hwnd, &mut buffer) };
    if len == 0 {
        return String::new();
    }

    String::from_utf16_lossy(&buffer[..len as usize])
}

fn find_explorer_root(mut hwnd: HWND) -> Option<HWND> {
    while !is_null_hwnd(hwnd) {
        let class_name = window_class_name(hwnd);
        if EXPLORER_CLASS_NAMES
            .iter()
            .any(|name| class_name == *name)
        {
            return Some(hwnd);
        }

        let parent = unsafe {
            GetParent(hwnd).unwrap_or(HWND(std::ptr::null_mut()))
        };
        if is_null_hwnd(parent) {
            break;
        }
        hwnd = parent;
    }

    None
}

fn push_unique_hwnd(candidates: &mut Vec<HWND>, hwnd: HWND) {
    if !is_null_hwnd(hwnd) && !candidates.iter().any(|existing| existing.0 == hwnd.0) {
        candidates.push(hwnd);
    }
}

pub(crate) fn explorer_hwnd_candidates(foreground: HWND) -> Vec<HWND> {
    let mut candidates = Vec::new();
    push_unique_hwnd(&mut candidates, foreground);

    if let Some(root) = find_explorer_root(foreground) {
        push_unique_hwnd(&mut candidates, root);

        if let Ok(tab) = unsafe {
            FindWindowExW(Some(root), None, w!("ShellTabWindowClass"), None)
        } {
            push_unique_hwnd(&mut candidates, tab);
        }
    }

    if let Ok(tab) = unsafe {
        FindWindowExW(Some(foreground), None, w!("ShellTabWindowClass"), None)
    } {
        push_unique_hwnd(&mut candidates, tab);
    }

    candidates
}

fn hwnd_matches(candidate: HWND, explorer_hwnds: &[HWND]) -> bool {
    explorer_hwnds.iter().any(|hwnd| hwnd.0 == candidate.0)
}

pub(crate) fn query_explorer_selection(explorer_hwnds: &[HWND]) -> Result<Vec<PathBuf>, String> {
    com_init()?;
    unsafe { query_explorer_selection_inner(explorer_hwnds) }
}

unsafe fn query_explorer_selection_inner(explorer_hwnds: &[HWND]) -> Result<Vec<PathBuf>, String> {
    let shell_windows: IShellWindows =
        CoCreateInstance(&ShellWindows, None, CLSCTX_SERVER)
            .map_err(|error| format!("创建 ShellWindows 实例失败: {error}"))?;

    let window_count = shell_windows
        .Count()
        .map_err(|error| format!("读取 Explorer 窗口数量失败: {error}"))?;

    for index in 0..window_count {
        let window: IDispatch = shell_windows
            .Item(&VARIANT::from(index))
            .map_err(|error| format!("读取 Explorer 窗口失败 (index={index}): {error}"))?;

        let service_provider: IServiceProvider = window
            .cast()
            .map_err(|error| format!("Explorer 窗口不支持 IServiceProvider: {error}"))?;

        let shell_browser = service_provider
            .QueryService::<IShellBrowser>(&IShellBrowser::IID)
            .map_err(|error| format!("查询 IShellBrowser 失败: {error}"))?;

        let browser_hwnd = shell_browser
            .GetWindow()
            .map_err(|error| format!("读取 Explorer HWND 失败: {error}"))?;

        if !hwnd_matches(browser_hwnd, explorer_hwnds) {
            continue;
        }

        let shell_view = shell_browser
            .QueryActiveShellView()
            .map_err(|error| format!("读取 Explorer 当前视图失败: {error}"))?;

        let shell_items = shell_view
            .GetItemObject::<IShellItemArray>(SVGIO_SELECTION)
            .map_err(|error| format!("读取 Explorer 选中项失败: {error}"))?;

        let selection_count = shell_items
            .GetCount()
            .map_err(|error| format!("读取选中项数量失败: {error}"))?;

        let mut paths = Vec::with_capacity(selection_count as usize);
        for item_index in 0..selection_count {
            let shell_item = shell_items
                .GetItemAt(item_index)
                .map_err(|error| format!("读取选中项失败 (index={item_index}): {error}"))?;

            if let Ok(attrs) = shell_item.GetAttributes(SFGAO_FILESYSTEM) {
                if attrs.0 == 0 {
                    continue;
                }
            }

            if let Some(path) = shell_item_path(&shell_item) {
                paths.push(path);
            }
        }

        return Ok(paths);
    }

    Ok(Vec::new())
}

fn shell_item_path(shell_item: &IShellItem) -> Option<PathBuf> {
    if let Ok(display_name) = unsafe { shell_item.GetDisplayName(SIGDN_FILESYSPATH) } {
        if let Ok(path) = unsafe { display_name.to_string() } {
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }

    if let Ok(display_name) = unsafe { shell_item.GetDisplayName(SIGDN_DESKTOPABSOLUTEPARSING) } {
        if let Ok(path) = unsafe { display_name.to_string() } {
            if !path.is_empty() {
                return Some(PathBuf::from(path));
            }
        }
    }

    None
}

/// Return keyboard focus to Explorer after the preview window closes (Esc / in-window Space).
pub fn restore_file_manager_focus() {
    let foreground = unsafe { GetForegroundWindow() };
    if !is_null_hwnd(foreground) && find_explorer_root(foreground).is_some() {
        return;
    }

    let Ok(()) = com_init() else {
        return;
    };

    unsafe {
        let shell_windows: IShellWindows = match CoCreateInstance(&ShellWindows, None, CLSCTX_SERVER) {
            Ok(instance) => instance,
            Err(_) => return,
        };

        let Ok(window_count) = shell_windows.Count() else {
            return;
        };

        for index in 0..window_count {
            let Ok(window) = shell_windows.Item(&VARIANT::from(index)) else {
                continue;
            };
            let Ok(service_provider) = window.cast::<IServiceProvider>() else {
                continue;
            };
            let Ok(shell_browser) = service_provider
                .QueryService::<IShellBrowser>(&IShellBrowser::IID)
            else {
                continue;
            };
            let Ok(browser_hwnd) = shell_browser.GetWindow() else {
                continue;
            };
            if is_null_hwnd(browser_hwnd) {
                continue;
            }
            if find_explorer_root(browser_hwnd).is_none() {
                continue;
            }
            if !IsWindowVisible(browser_hwnd).as_bool() {
                continue;
            }

            let _ = SetForegroundWindow(browser_hwnd);
            return;
        }
    }
}
