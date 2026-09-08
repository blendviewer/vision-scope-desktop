import * as scopeSdk from '@blendviewer/vision-scope';
import { VisionScope, QUICKLOOK_LAS_MAX_POINTS } from '@blendviewer/vision-scope';
import '@blendviewer/vision-scope/styles.css';
import { invoke } from '@tauri-apps/api/core';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import { isDuckdbTabularFilename } from '../src/lib/tabularPreview.js';
import { registerHdf5Extension } from '../src/lib/registerHdf5Extension.js';
import { notifyHost } from './host-bridge.js';

/** @type {VisionScope | null} */
let scope = null;

/** @type {string | null} */
let lastBlobUrl = null;

/** @type {Promise<{ formats: Record<string, { enabled?: boolean, requiredPlugin?: string, previewLayout?: { width: number, height: number, aspectRatio: string }> }> }> | null} */
let registryPromise = null;

/**
 * Adjust the Tauri preview window to match the previewLayout for this file type.
 *
 * Mirrors macOS Quick Look's `applyPreviewLayout(layout.preferredSize)` —
 * the window is resized + re-centered to the dimensions declared in
 * `preview-registry.json` so that Windows Explorer space-preview matches
 * the macOS Quick Look panel size exactly.
 *
 * @param {string} filename
 */
async function adjustWindowSize(filename) {
  try {
    const registry = await loadPreviewRegistry();
    const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() ?? '' : '';
    const layout = registry.formats?.[ext]?.previewLayout;
    if (!layout || !layout.width || !layout.height) {
      return;
    }

    const win = getCurrentWebviewWindow();
    await win.setSize(new LogicalSize(layout.width, layout.height));
    await win.center();
  } catch (error) {
    console.warn('[VisionScope Preview] window resize failed:', error);
  }
}

/**
 * Base URL for bundled nestcad / wasm assets.
 *
 * Quick Look `.appex` loads from `file://` where `location.origin` is `"null"`.
 * Must use directory-relative paths (legacy quicklook.html behaviour).
 */
function assetBase() {
  if (typeof window === 'undefined') {
    return './';
  }

  const { href, origin, protocol } = window.location;
  if (protocol === 'file:' || !origin || origin === 'null') {
    return href.replace(/\/[^/]*$/, '/');
  }

  return `${origin}/`;
}

function previewHostBase() {
  const base = assetBase().replace(/\/$/, '');
  if (base.startsWith('http://') || base.startsWith('https://')) {
    return base;
  }
  return '';
}

function createScopeOptions() {
  const base = assetBase();
  const loaders = `${base}nestcad-loaders/loaders/`;
  return {
    container: document.getElementById('viewer'),
    ui: false,
    branding: false,
    lasMaxPoints: QUICKLOOK_LAS_MAX_POINTS,
    nestcadLibLocation: `${base}nestcad-loaders/`,
    previewHost: previewHostBase(),
    wasmPaths: {
      rhino3dm: loaders,
      draco: loaders,
      basis: loaders,
      ifc: loaders,
    },
  };
}

async function loadPreviewRegistry() {
  if (!registryPromise) {
    registryPromise = fetch('./preview-registry.json')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`preview-registry.json ${response.status}`);
        }
        return response.json();
      })
      .catch((error) => {
        console.warn('[VisionScope Preview] registry unavailable, allowing preview', error);
        return { formats: {} };
      });
  }
  return registryPromise;
}

/**
 * @param {string} ext
 */
async function assertPreviewEnabled(ext) {
  const registry = await loadPreviewRegistry();
  const entry = registry.formats?.[ext];
  if (!entry) {
    return { ok: true };
  }
  if (entry.enabled) {
    return { ok: true };
  }
  if (entry.requiredPlugin) {
    return {
      ok: false,
      message: `需要安装并启用插件：${entry.requiredPlugin}`,
    };
  }
  return {
    ok: false,
    message: '此格式尚未在空间预览中启用',
  };
}

/**
 * Friendly loading overlay shown while VisionScope parses the file and
 * lazy-loads format-specific WASM (e.g. rhino3dm 2.7 MB, occt 21 MB,
 * duckdb 37 MB).  On first preview these can take several seconds; the
 * overlay replaces a blank white panel with a spinner + format name +
 * progress text so the user knows the app is working, not frozen.
 *
 * @param {string} filename
 */
function showLoadingOverlay(filename) {
  let overlay = document.getElementById('preview-loading-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'preview-loading-overlay';
    overlay.style.cssText = [
      'position:absolute', 'inset:0', 'z-index:10',
      'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
      'gap:16px', 'background:rgba(255,255,255,0.92)',
      'border-radius:12px',
      'font:14px/1.6 system-ui,sans-serif', 'color:#475569',
      'pointer-events:none',
    ].join(';');

    const spinner = document.createElement('div');
    spinner.style.cssText = [
      'width:32px', 'height:32px',
      'border:3px solid #e2e8f0', 'border-top-color:#3b82f6',
      'border-radius:50%',
      'animation:preview-spin 0.8s linear infinite',
    ].join(';');
    overlay.appendChild(spinner);

    const label = document.createElement('div');
    label.id = 'preview-loading-label';
    label.style.cssText = 'font-size:15px;font-weight:600;color:#334155';
    overlay.appendChild(label);

    const hint = document.createElement('div');
    hint.id = 'preview-loading-hint';
    hint.style.cssText = 'font-size:13px;color:#94a3b8';
    overlay.appendChild(hint);

    // Inject keyframes once
    if (!document.getElementById('preview-loading-style')) {
      const style = document.createElement('style');
      style.id = 'preview-loading-style';
      style.textContent = '@keyframes preview-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(style);
    }

    const app = document.getElementById('app') || document.body;
    app.appendChild(overlay);
  }

  const ext = filename.includes('.') ? filename.split('.').pop()?.toUpperCase() ?? '' : '';
  const label = document.getElementById('preview-loading-label');
  const hint = document.getElementById('preview-loading-hint');
  if (label) label.textContent = 'Loading…';
  if (hint) hint.textContent = '';
  overlay.style.display = 'flex';
}

/**
 * Remove the loading overlay once the preview is ready (or on error).
 */
function hideLoadingOverlay() {
  const overlay = document.getElementById('preview-loading-overlay');
  if (overlay) overlay.style.display = 'none';
}

/**
 * @param {string} message
 */
function showPreviewMessage(message) {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = message;
    return;
  }

  const viewer = document.getElementById('viewer');
  if (!viewer) {
    return;
  }
  viewer.innerHTML = '';
  const panel = document.createElement('div');
  panel.style.cssText =
    'display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:#64748b;font:14px/1.5 system-ui,sans-serif;';
  panel.textContent = message;
  viewer.appendChild(panel);
}

function resetScope() {
  if (lastBlobUrl) {
    URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = null;
  }

  if (scope) {
    scope.cancelLoad();
    scope.destroy();
    scope = null;
  }

  const container = document.getElementById('viewer');
  if (container) {
    container.replaceChildren();
    container.className = '';
    container.removeAttribute('style');
  }
}

async function ensureScope() {
  if (!scope) {
    // 首次创建 scope 前，确保 HDF5 scope extension（.h5/.hdf5）已注册。
    registerHdf5Extension(scopeSdk);
    scope = new VisionScope(createScopeOptions());
  }
  return scope;
}

/**
 * Stream tabular files from disk (Space preview).
 *
 * 与主窗口 + SDK Playground 一致：不传 localFile（避免 BROWSER_FILEREADER
 * 在 Tauri WKWebView 里的兼容性问题），让 SDK 走 fetch(blob:url) →
 * registerFileBuffer fallback 路径。
 *
 * @param {string} path
 * @param {string} filename
 */
export async function previewFileFromPath(path, filename) {
  const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() ?? '' : '';
  const gate = await assertPreviewEnabled(ext);
  if (!gate.ok) {
    showPreviewMessage(gate.message);
    notifyHost('loaded');
    return;
  }

  await adjustWindowSize(filename);

  resetScope();
  const instance = await ensureScope();
  instance.showLoading();
  showLoadingOverlay(filename);

  try {
    const bytes = await invoke('read_file_bytes', { path });
    const uint8 = new Uint8Array(bytes);
    const blob = new Blob([uint8], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    VisionScope.setBlobMetadata(url, { filename });
    await instance.load(url, { filename });
    hideLoadingOverlay();
    notifyHost('loaded');
  } catch (error) {
    console.error('[VisionScope Preview]', error);
    instance.hideLoading();
    hideLoadingOverlay();
    showPreviewMessage(error?.message ? String(error.message) : '预览加载失败');
    notifyHost('error');
  }
}

/**
 * @param {ArrayBuffer} buffer
 * @param {string} filename
 */
export async function previewFileFromBuffer(buffer, filename) {
  const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() ?? '' : '';
  const gate = await assertPreviewEnabled(ext);
  if (!gate.ok) {
    showPreviewMessage(gate.message);
    notifyHost('loaded');
    return;
  }

  await adjustWindowSize(filename);

  resetScope();
  const instance = await ensureScope();
  instance.showLoading();
  showLoadingOverlay(filename);

  try {
    if (buffer.byteLength === 0) {
      throw new Error('empty preview payload');
    }

    const blob = new Blob([buffer]);
    const blobUrl = URL.createObjectURL(blob);
    lastBlobUrl = blobUrl;
    VisionScope.setBlobMetadata(blobUrl, { filename });
    await instance.load(blobUrl, { filename });
    hideLoadingOverlay();
    notifyHost('loaded');
  } catch (error) {
    console.error('[VisionScope Preview]', error);
    instance.hideLoading();
    hideLoadingOverlay();
    showPreviewMessage(error?.message ? String(error.message) : '预览加载失败');
    notifyHost('error');
  }
}

/**
 * macOS `.appex` entry — stream via custom URL scheme handler.
 * @param {string} previewUrl
 * @param {string} filename
 */
export async function previewFileFromUrl(previewUrl, filename) {
  const ext = filename.includes('.') ? filename.split('.').pop()?.toLowerCase() ?? '' : '';
  const gate = await assertPreviewEnabled(ext);
  if (!gate.ok) {
    showPreviewMessage(gate.message);
    notifyHost('loaded');
    return;
  }

  await adjustWindowSize(filename);

  resetScope();
  const instance = await ensureScope();
  instance.showLoading();
  showLoadingOverlay(filename);

  try {
    // For tabular files, use streaming via custom URL scheme
    if (isDuckdbTabularFilename(filename)) {
      await instance.load(previewUrl, {
        filename,
        duckdbSourceUrl: previewUrl,
      });
      hideLoadingOverlay();
    } else {
      // For other files, fetch and convert to blob
      // previewFileFromBuffer has its own overlay management
      hideLoadingOverlay();
      const response = await fetch(previewUrl);
      const buffer = await response.arrayBuffer();
      await previewFileFromBuffer(buffer, filename);
      return;
    }
    notifyHost('loaded');
  } catch (error) {
    console.error('[VisionScope Preview]', error);
    instance.hideLoading();
    hideLoadingOverlay();
    showPreviewMessage(error?.message ? String(error.message) : '预览加载失败');
    notifyHost('error');
  }
}

export function notifyPreviewReady() {
  notifyHost('ready');
}
