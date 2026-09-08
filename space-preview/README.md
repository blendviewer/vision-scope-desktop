# Space Preview (Tauri)

Windows/macOS 空格预览的 Tauri 实现。与 macOS `.appex` Quick Look **并行存在**：

| 平台 | 正式 Quick Look | 本模块 |
|---|---|---|
| macOS | `quicklook/VisionScopeQuickLook.appex` | PoC：`VISIONSCOPE_SPACE_PREVIEW=1` 时 Finder + Space |

> **macOS 注意**：默认**不**注册 Tauri 全局 Space，否则 VisionScope 运行时会把 Finder 的空格抢走，导致 `.appex` Quick Look 失效。重新打包安装后，即使 VisionScope 在后台运行，Finder 空格预览也应正常。
| Windows | 无系统 API | **主路径**：Explorer 选中 + Space |

## 架构

```text
Space 全局快捷键 (Rust: preview/shortcut.rs)
        ↓
platform 取选中文件 (preview/platform/*.rs)   ← Windows 主要工作量在这里
        ↓
preview_show_file / preview_toggle (preview/service.rs)
        ↓
Tauri 浮窗 preview.html (src-preview/main.js)
        ↓
read_file_bytes → VisionScope (src-preview/preview-core.js)
```

## Mac 上现在能测什么

1. 启动：`pnpm dev:space-preview`
2. **Mock 预览**（DevTools 控制台）：

   ```javascript
   import { invoke } from '@tauri-apps/api/core';
   await invoke('preview_show_file', { path: '/absolute/path/to/model.glb' });
   await invoke('preview_hide');
   ```

3. **Finder + Space**（PoC）：VisionScope 常驻后台 → Finder 选中文件 → 按 Space  
   - 实现见 `src-tauri/src/preview/platform/macos.rs`（AppleScript）
   - 正式 macOS Quick Look 仍走 `.appex`，此处仅供开发验证

4. 调试选中项：

   ```javascript
   await invoke('preview_get_selection');
   ```

## Windows Cursor — 从这里继续

### 必做：`src-tauri/src/preview/platform/windows.rs`

实现两个函数：

```rust
pub fn is_file_manager_frontmost() -> bool
pub fn get_file_manager_selection() -> Result<Vec<PathBuf>, String>
```

推荐步骤：

1. 添加 `windows` crate 依赖（项目已有间接依赖，可在 `[target.'cfg(windows)'.dependencies]` 显式引入）
2. `GetForegroundWindow` + `GetClassNameW` 判断 Explorer（`CabinetWClass`）
3. Shell COM：`Shell.Application` → `ShellWindows` → 匹配前台 HWND → `Document.SelectedItems()`
4. 解析 `Path` 属性，返回 `Vec<PathBuf>`
5. 无选中 / 非 Explorer 前台 → 返回 `Ok(vec![])`

### 已有、通常不用改

| 文件 | 作用 |
|---|---|
| `src-preview/main.js` | 监听 `preview://load`，调 `read_file_bytes` |
| `src-preview/preview-core.js` | VisionScope 加载 + registry 门禁 |
| `src-preview/host-bridge.js` | webkit / WebView2 / Tauri 宿主信号 |
| `preview/window.rs` | 浮窗创建、显示、事件派发 |
| `preview/shortcut.rs` | 全局 Space → `preview_toggle` |

### Windows 验证清单

- [ ] `pnpm tauri dev` 在 Windows 上启动
- [ ] `preview_show_file` 能预览 `.glb` / `.step`
- [ ] Explorer 前台 + 单选 + Space 弹出预览
- [ ] 再按 Space / Esc 关闭
- [ ] 非 Explorer 前台按 Space 无反应
- [ ] WebView2 下 WebGL / WASM（OCCT）正常

### 可选后续（v2）

- ↑↓ 切换同目录文件
- 开机自启 / 托盘图标
- Open/Save 对话框集成

## Tauri Commands

| Command | 说明 |
|---|---|
| `preview_show_file { path }` | Mock / 显式路径预览 |
| `preview_hide` | 关闭浮窗 |
| `preview_toggle` | Space 调用：取选中项并 toggle |
| `preview_get_selection` | 调试：返回 Finder/Explorer 选中路径 |
| `preview_window_ready` | 预览 webview 就绪（内部） |

## 事件

| 事件 | 方向 | Payload |
|---|---|---|
| `preview://load` | Rust → preview.html | `{ path, filename }` |

## 构建

`preview.html` 已加入 Vite 多入口；`preview-registry.json` 仍由 `pnpm generate:quicklook` 生成。

```bash
pnpm generate:quicklook   # 可选，刷新 registry
pnpm dev:space-preview    # 开发
pnpm tauri build          # 打包
```
