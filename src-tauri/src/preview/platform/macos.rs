//! macOS file-manager hooks for space-preview **development and PoC testing**.
//!
//! Production macOS Quick Look is handled by `quicklook/VisionScopeQuickLook.appex`.
//! These AppleScript helpers let you validate the Tauri preview window in Finder
//! before Windows Explorer COM integration exists.

use std::path::PathBuf;
use std::process::Command;

fn run_osascript(script: &str) -> Result<String, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| format!("osascript 启动失败: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "AppleScript 执行失败".into()
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn is_file_manager_frontmost() -> bool {
    let script = r#"
        tell application "System Events"
            set frontApp to name of first application process whose frontmost is true
        end tell
        return frontApp
    "#;

    run_osascript(script)
        .map(|name| name == "Finder")
        .unwrap_or(false)
}

pub fn get_file_manager_selection() -> Result<Vec<PathBuf>, String> {
    if !is_file_manager_frontmost() {
        return Ok(Vec::new());
    }

    let script = r#"
        tell application "Finder"
            if (count of selection) is 0 then return ""
            set lines to {}
            repeat with itemRef in selection
                set end of lines to POSIX path of (itemRef as alias)
            end repeat
            set AppleScript's text item delimiters to linefeed
            set out to lines as text
            set AppleScript's text item delimiters to ""
            return out
        end tell
    "#;

    let stdout = run_osascript(script)?;
    if stdout.is_empty() {
        return Ok(Vec::new());
    }

    Ok(stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(PathBuf::from)
        .collect())
}
