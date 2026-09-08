import * as scopeSdk from '@blendviewer/vision-scope';
import { VisionScope, DEFAULT_LAS_MAX_POINTS } from '@blendviewer/vision-scope';
import '@blendviewer/vision-scope/styles.css';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isDuckdbTabularFilename } from './lib/tabularPreview.js';
import { primeHdf5Extension, registerHdf5Extension } from './lib/registerHdf5Extension.js';
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

function getAssetBase() {
  if (typeof window === 'undefined') {
    return './';
  }
  return `${window.location.origin}/`;
}

function createScopeOptions() {
  const base = getAssetBase();
  const loaders = `${base}nestcad-loaders/loaders/`;
  return {
    container: document.getElementById('viewer'),
    ui: true,
    lasMaxPoints: DEFAULT_LAS_MAX_POINTS,
    nestcadLibLocation: `${base}nestcad-loaders/`,
    previewHost: typeof window !== 'undefined' ? window.location.origin : '',
    wasmPaths: {
      rhino3dm: loaders,
      draco: loaders,
      basis: loaders,
      ifc: loaders,
    },
  };
}

async function initScope() {
  scope = new VisionScope(createScopeOptions());
}

/**
 * 从本地路径提取文件名（含扩展名），用于 SDK 类型识别。
 */
function basename(path) {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

function isLoadCancelled(err) {
  return err?.name === 'AbortError' || /cancel/i.test(String(err?.message || ''));
}

/**
 * DuckDB tabular (parquet / csv / tsv): read bytes via Rust → blob URL → SDK。
 *
 * 与 SDK Playground 完全一致的做法：不传 localFile（避免 BROWSER_FILEREADER
 * 协议在 Tauri WKWebView 里的兼容性问题），让 SDK 走 fallback 路径——
 * fetch(blob:url) → registerFileBuffer（全量读入 DuckDB 内存）。
 * Playground 已验证此路径可正确打开 parquet。
 */
async function openLocalTabularFile(path, filename) {
  showViewer();
  scope.cancelLoad();
  scope.showLoading();

  const bytes = await invoke('read_file_bytes', { path });
  const uint8 = new Uint8Array(bytes);
  const blob = new Blob([uint8], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  VisionScope.setBlobMetadata(url, { filename });
  await scope.load(url, { filename });
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
    const filename = basename(path);
    if (isDuckdbTabularFilename(filename)) {
      await openLocalTabularFile(path, filename);
      return;
    }

    // 确保 HDF5 scope extension 已注册（.h5/.hdf5 走独立 bundle）。
    registerHdf5Extension(scopeSdk);

    // 立即隐藏空状态文案，并同步显示 SDK 的全局 loading，
    // 让 spinner 从「点击打开」那一刻就出现，覆盖读字节空白期。
    showViewer();
    scope.cancelLoad();
    scope.showLoading();

    const bytes = await invoke('read_file_bytes', { path });
    const uint8 = new Uint8Array(bytes);
    const blob = new Blob([uint8]);
    const url = URL.createObjectURL(blob);

    VisionScope.setBlobMetadata(url, { filename });
    await scope.load(url, { filename });
  } catch (err) {
    scope.hideLoading();
    if (isLoadCancelled(err)) {
      return;
    }
    console.error('Failed to open file:', err);
    alert(`Failed to open file: ${err}`);
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
      // 与 Playground 一致：不传 localFile，走 registerFileBuffer fallback
      const url = URL.createObjectURL(file);
      VisionScope.setBlobMetadata(url, { filename: file.name });
      showViewer();
      scope.cancelLoad();
      scope.showLoading();
      try {
        await scope.load(url, { filename: file.name });
      } catch (err) {
        scope.hideLoading();
        if (!isLoadCancelled(err)) {
          console.error('Failed to open file:', err);
          alert(`Failed to open file: ${err}`);
        }
      }
    }
  }
});

// 文件关联 / 双击打开
async function handleFileOpen() {
  const appWindow = getCurrentWindow();

  // 方案一：监听文件拖入（macOS 双击关联文件时也会触发 drag-drop 事件）
  await appWindow.onDragDropEvent((event) => {
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
  // 后台注册 HDF5 scope extension（.h5/.hdf5），不阻塞启动；
  // 首次打开 .h5 前若尚未就绪，openLocalFile 会再 await 一次。
  primeHdf5Extension(scopeSdk);
  showHint();
  await handleFileOpen();
})();
