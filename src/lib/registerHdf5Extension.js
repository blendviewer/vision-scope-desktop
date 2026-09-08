/**
 * Register the HDF5 scope extension (`.h5` / `.hdf5`) into vision-scope.
 *
 * The HDF5 plugin ships as an independent, self-contained ESM bundle
 * (`dist/index.js`, React 18 + @h5web/app + @h5web/h5wasm all inlined and
 * minified), so it does not pollute the host's React 19 tree. Vite treats the
 * plugin's pre-built bundle as a separate chunk (see `manualChunks` in
 * vite.config.js), keeping React 18 fully isolated from the desktop app's
 * React 19 runtime.
 *
 * We statically import its `scopeExtension` export and register it via the
 * SDK's `registerScopeExtension` helper, which wraps `mountPreview` as a
 * RendererFactory renderer and routes `.h5` / `.hdf5` to it.
 *
 * Shared by the two desktop entries:
 *   - src/main.js            (in-app open / double-click / drag-drop)
 *   - src-preview/preview-core.js  (Finder Quick Look / Windows space preview)
 */

import { scopeExtension } from '@blendviewer/vision-hdf5-plugin';

/** @type {boolean} */
let registered = false;

/**
 * Register the HDF5 scope extension (idempotent, process-wide).
 *
 * @param {typeof import('@blendviewer/vision-scope')} scopeSdk
 *   The vision-scope SDK module (must expose `registerScopeExtension`).
 * @returns {boolean} true if registration completed (or was already done)
 */
export function registerHdf5Extension(scopeSdk) {
  if (registered) {
    return true;
  }

  try {
    if (!scopeExtension) {
      console.warn(
        '[VisionScope] HDF5 plugin loaded but no `scopeExtension` export found; skipping.'
      );
      return false;
    }
    scopeSdk.registerScopeExtension(scopeExtension);
    registered = true;
    console.log('[VisionScope] HDF5 scope extension registered:', scopeExtension.id);
    return true;
  } catch (err) {
    console.error('[VisionScope] Failed to register HDF5 scope extension:', err);
    return false;
  }
}

/**
 * Kick off registration in the background (fire-and-forget) so it is ready
 * before the first `.h5` file is opened, without blocking app startup.
 *
 * @param {typeof import('@blendviewer/vision-scope')} scopeSdk
 */
export function primeHdf5Extension(scopeSdk) {
  registerHdf5Extension(scopeSdk);
}
