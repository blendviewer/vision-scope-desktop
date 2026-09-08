import { notifyPreviewReady, previewFileFromUrl } from '../src-preview/preview-core.js';

window.__visionScopeQuickLook = {
  previewFileFromUrl: (previewUrl, filename) => {
    void previewFileFromUrl(previewUrl, filename);
  },
};

notifyPreviewReady();
