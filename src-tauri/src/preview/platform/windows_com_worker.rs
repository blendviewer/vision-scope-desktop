//! Background Explorer selection cache.
//!
//! Low-level keyboard hooks cannot call Shell COM (including via `SendMessage` to
//! another thread) — Windows returns `RPC_E_CANTCALLOUT_ININPUTSYNCCALL` (0x8001010D).
//! A dedicated thread polls Explorer selection into a cache; the hook only reads it.

use std::path::PathBuf;
use std::sync::{mpsc, OnceLock, RwLock};
use std::thread;
use std::time::Duration;

static SELECTION_CACHE: RwLock<Vec<PathBuf>> = RwLock::new(Vec::new());
static POLLER_STARTED: OnceLock<Result<(), String>> = OnceLock::new();

const POLL_INTERVAL_MS: u64 = 40;

/// Start the selection poller. Safe to call multiple times.
pub fn init() -> Result<(), String> {
    match POLLER_STARTED.get_or_init(start_poller) {
        Ok(()) => Ok(()),
        Err(error) => Err(error.clone()),
    }
}

fn start_poller() -> Result<(), String> {
    let (ready_tx, ready_rx) = mpsc::sync_channel::<Result<(), String>>(1);

    thread::Builder::new()
        .name("explorer-selection-poller".into())
        .spawn(move || poller_loop(ready_tx))
        .map_err(|error| format!("启动 Explorer selection poller 失败: {error}"))?;

    ready_rx
        .recv()
        .map_err(|error| format!("Explorer selection poller 启动超时: {error}"))?
}

/// Latest polled selection — safe to call from the keyboard hook.
pub fn cached_selection() -> Vec<PathBuf> {
    SELECTION_CACHE
        .read()
        .map(|paths| paths.clone())
        .unwrap_or_default()
}

fn poller_loop(ready_tx: mpsc::SyncSender<Result<(), String>>) {
    if let Err(error) = super::com_init() {
        let _ = ready_tx.send(Err(error));
        return;
    }

    refresh_cache();
    let _ = ready_tx.send(Ok(()));

    loop {
        thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        refresh_cache();
    }
}

fn refresh_cache() {
    let paths = if super::is_file_manager_frontmost() {
        let foreground = unsafe {
            windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow()
        };
        let hwnd_candidates = super::explorer_hwnd_candidates(foreground);
        super::query_explorer_selection(&hwnd_candidates).unwrap_or_default()
    } else {
        Vec::new()
    };

    if let Ok(mut cache) = SELECTION_CACHE.write() {
        *cache = paths;
    }
}
