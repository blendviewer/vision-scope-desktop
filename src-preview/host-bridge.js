/**
 * Host bridge for space-preview / Quick Look webviews.
 *
 * Hosts:
 * - macOS `.appex`     → `window.webkit.messageHandlers.visionscope`
 * - Windows WebView2   → `window.chrome.webview` (reserved for future native shell)
 * - Tauri preview win  → optional callbacks set by `src-preview/main.js`
 *
 * Windows Cursor: if you embed this page in raw WebView2 instead of Tauri,
 * wire `chrome.webview.addEventListener('message', ...)` alongside these helpers.
 */

/** @typedef {'ready' | 'loaded' | 'error'} PreviewHostSignal */

/** @type {((signal: PreviewHostSignal) => void) | null} */
let tauriHostListener = null;

/**
 * @param {(signal: PreviewHostSignal) => void} listener
 */
export function setTauriHostListener(listener) {
  tauriHostListener = listener;
}

/**
 * @param {PreviewHostSignal} signal
 */
export function notifyHost(signal) {
  if (tauriHostListener) {
    tauriHostListener(signal);
    return;
  }

  const webkitHandler = window.webkit?.messageHandlers?.visionscope;
  if (webkitHandler?.postMessage) {
    webkitHandler.postMessage(signal);
    return;
  }

  const chromeWebview = window.chrome?.webview;
  if (chromeWebview?.postMessage) {
    chromeWebview.postMessage(signal);
  }
}

/**
 * WebView2 → JS messages (for non-Tauri hosts).
 * @param {(data: unknown) => void} handler
 */
export function onWebView2HostMessage(handler) {
  const chromeWebview = window.chrome?.webview;
  if (!chromeWebview?.addEventListener) {
    return () => {};
  }

  const listener = (event) => handler(event.data);
  chromeWebview.addEventListener('message', listener);
  return () => chromeWebview.removeEventListener('message', listener);
}
