import { VisionScope } from '@blendviewer/vision-scope';
import '@blendviewer/vision-scope/styles.css';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './styles.css';

let scope = null;

function showViewer() {
  document.getElementById('drop-hint').style.display = 'none';
  document.getElementById('viewer').style.display = 'block';
}

function showHint() {
  document.getElementById('drop-hint').style.display = 'flex';
  document.getElementById('viewer').style.display = 'none';
}

async function initScope() {
  scope = new VisionScope({
    container: document.getElementById('viewer'),
    ui: true,
  });
}

/**
 * 从本地路径提取文件名（含扩展名），用于 SDK 类型识别。
 */
function basename(path) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/**
 * 通过 Rust 侧读取文件字节，转成 blob URL 喂给 SDK。
 *
 * 关键：blob URL 没有扩展名，SDK 的 FileTypeDetector 无法从 blob: 前缀
 * 推断文件类型，必须显式传入 filename（并调用 setBlobMetadata），
 * 否则 detectFromUrl 路由失败 → 空白。
 */
async function openLocalFile(path) {
  try {
    // 立即隐藏「打开文件」卡片，并同步显示 SDK 的全局 loading，
    // 让 spinner 从「点击打开」那一刻就出现，覆盖读字节空白期。
    showViewer();
    scope.showLoading();

    const filename = basename(path);
    const bytes = await invoke('read_file_bytes', { path });
    const uint8 = new Uint8Array(bytes);
    const blob = new Blob([uint8]);
    const url = URL.createObjectURL(blob);

    VisionScope.setBlobMetadata(url, { filename });
    await scope.load(url, { filename });
  } catch (err) {
    scope.hideLoading();
    console.error('打开文件失败:', err);
    alert(`打开文件失败：${err}`);
  }
}

// 拖拽打开（桌面拖入的文件有 .path）
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    const file = files[0];
    if (file.path) {
      await openLocalFile(file.path);
    } else {
      // 兜底：webview 内拖入的 File 对象（有 .name）
      const url = URL.createObjectURL(file);
      VisionScope.setBlobMetadata(url, { filename: file.name });
      showViewer();
      scope.showLoading();
      await scope.load(url, { filename: file.name });
    }
  }
});

// 文件关联 / 双击打开
async function handleFileOpen() {
  const appWindow = getCurrentWindow();

  // 方案一：监听文件拖入（macOS 双击关联文件时也会触发 file-drop 事件）
  await appWindow.onFileDropEvent((event) => {
    if (event.payload.type === 'drop') {
      const paths = event.payload.paths;
      if (paths && paths.length > 0) {
        openLocalFile(paths[0]);
      }
    }
  });

  // 方案二：读取启动时传入的文件路径
  try {
    const initialPath = await invoke('get_initial_file_path');
    if (initialPath) {
      await openLocalFile(initialPath);
    }
  } catch (_) {
    // 忽略，首次启动无文件
  }
}

// 选择文件按钮
document.getElementById('open-btn').addEventListener('click', async () => {
  try {
    const path = await invoke('pick_file');
    if (path) {
      await openLocalFile(path);
    }
  } catch (_) {
    // 用户取消
  }
});

// 初始化
(async () => {
  await initScope();
  showHint();
  await handleFileOpen();
})();
