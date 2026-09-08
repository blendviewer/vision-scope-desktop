import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { notifyPreviewReady, previewFileFromBuffer, previewFileFromPath } from './preview-core.js';
import { isDuckdbTabularFilename } from '../src/lib/tabularPreview.js';

/** @type {Promise<void> | null} */
let readyPromise = null;

/** Dedupe concurrent loads for the same path (Rust may wake JS more than once). */
/** @type {number} */
let loadGeneration = 0;

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = invoke('preview_window_ready');
  }
  return readyPromise;
}

function setStatus(message) {
  const status = document.getElementById('status');
  if (!status) {
    return;
  }

  // 初始 HTML 里 #status 内联了 spinner + 文字（首屏即显示，避免首次打开白屏）。
  // 这里只更新文字部分，保留 spinner；当 message 为空时整体隐藏。
  const text = status.querySelector('span');
  if (text) {
    text.textContent = message ?? '';
  } else {
    status.textContent = message ?? '';
  }

  if (!message) {
    status.style.display = 'none';
  } else {
    status.style.display = 'flex';
  }
}

/**
 * @param {{ path: string, filename?: string }} payload
 */
async function handlePreviewLoad(payload) {
  const path = payload?.path;
  if (!path) {
    setStatus('未收到文件路径');
    return;
  }

  const generation = ++loadGeneration;

  const filename =
    payload.filename ||
    (path.includes('/') || path.includes('\\') ? path.split(/[/\\]/).pop() : path) ||
    'file';

  setStatus('Loading…');

  try {
    if (isDuckdbTabularFilename(filename)) {
      if (generation !== loadGeneration) {
        return;
      }
      await previewFileFromPath(path, filename);
      if (generation !== loadGeneration) {
        return;
      }
      setStatus('');
      return;
    }

    const bytes = await invoke('read_file_bytes', { path });
    if (generation !== loadGeneration) {
      return;
    }

    const buffer = new Uint8Array(bytes).buffer;
    await previewFileFromBuffer(buffer, filename);
    if (generation !== loadGeneration) {
      return;
    }
    setStatus('');
  } catch (error) {
    if (generation !== loadGeneration) {
      return;
    }
    console.error('[VisionScope Preview] load failed:', error);
    setStatus(`预览失败：${error?.message ?? error}`);
  }
}

/** Pull pending payload from Rust (fallback when direct dispatch is unavailable). */
async function pullAndLoad() {
  try {
    const payload = await invoke('preview_pull_load');
    if (payload) {
      await handlePreviewLoad(payload);
    }
  } catch (error) {
    console.error('[VisionScope Preview] pull failed:', error);
    setStatus(`预览拉取失败：${error?.message ?? error}`);
  }
}

function bindCloseButton() {
  const closeButton = document.getElementById('close-button');
  if (!closeButton) {
    return;
  }

  // 关闭按钮只对 Windows 显示：macOS 走 Quick Look 原生面板，不经过此 Tauri 预览窗口。
  if (!navigator.platform.startsWith('Win')) {
    closeButton.remove();
    return;
  }

  closeButton.style.display = 'flex';
  closeButton.addEventListener('click', () => {
    void invoke('preview_hide');
  });
}

function bindCloseShortcuts() {
  const previewWindow = getCurrentWebviewWindow();

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' && event.key !== ' ') {
      return;
    }

    void (async () => {
      const visible = await previewWindow.isVisible();
      if (!visible) {
        return;
      }
      event.preventDefault();
      await invoke('preview_hide');
    })();
  });
}

async function bootstrap() {
  const previewWindow = getCurrentWebviewWindow();
  bindCloseShortcuts();
  bindCloseButton();

  globalThis.__visionScopePullPreview = pullAndLoad;
  globalThis.__visionScopeLoadPreview = (payload) => {
    void handlePreviewLoad(payload);
  };

  // 尽早把 web_ready 置 true：这样 Rust 侧在用户按 Space 时能立即走
  // `trigger_preview_pull`（直接 window.eval 注入 payload），而不是等 JS 慢慢
  // bootstrap 完再 pull。首次打开慢的一个原因就是 web_ready 置位太晚，导致
  // 首次 Space 只能走 pending + 迟到的 pull。
  try {
    await ensureReady();
  } catch (error) {
    console.error('[VisionScope Preview] ensureReady failed:', error);
  }

  await previewWindow.listen('preview-load', () => {
    void pullAndLoad();
  });

  notifyPreviewReady();

  try {
    await pullAndLoad();
  } catch (error) {
    console.error('[VisionScope Preview] bootstrap failed:', error);
    setStatus(`预览初始化失败：${error?.message ?? error}`);
    return;
  }

  setStatus('');

  await previewWindow.onCloseRequested(async (event) => {
    event.preventDefault();
    await invoke('preview_hide');
  });
}

void bootstrap().catch((error) => {
  console.error('[VisionScope Preview] fatal bootstrap error:', error);
  setStatus(`预览启动失败：${error?.message ?? error}`);
});
