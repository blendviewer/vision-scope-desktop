import {
  BUILTIN_FORMATS,
  PREVIEW_LAYOUTS,
  getBuiltinFormat,
  listBuiltinExtensions,
} from '@blendviewer/vision-scope/formats';

import {
  FILE_ASSOCIATION_EXTENSIONS,
  PLATFORM_BY_CATEGORY,
  PLATFORM_BY_EXT,
  PLATFORM_BY_SUBTYPE,
} from './platformFormats.js';

import { BUILTIN_PLUGIN_EXTENSIONS } from './quickLookUnion.js';

import {
  buildPreviewRegistry,
  getQuickLookUnionLayoutKeys,
  getQuickLookUnionMimeTypes,
  isQuickLookActiveForExt,
  listDeclaredUnionUtis,
  listQuickLookUnionEntries,
  listQuickLookUnionExtensions,
  listQuickLookUnionUtis,
  listQuickLookActiveExtensions,
} from './resolveQuickLookManifest.js';

/**
 * @param {string} ext
 * @returns {import('./platformFormats.js').PlatformCapability & {
 *   ext: string,
 *   category: string,
 *   subtype: string,
 *   mime: string,
 *   highlightLanguage: string,
 *   canPreview: boolean,
 *   canQuickLook: boolean,
 *   previewLayoutKey: string,
 *   previewLayout: { width: number, height: number, aspectRatio: string },
 * } | null}
 */
export function resolvePlatformCapability(ext) {
  const format = getBuiltinFormat(ext);
  if (!format) {
    return null;
  }

  const merged = {
    ...PLATFORM_BY_CATEGORY[format.category],
    ...PLATFORM_BY_SUBTYPE[format.subtype],
    ...PLATFORM_BY_EXT[format.ext],
  };

  const previewLayoutKey =
    merged.previewLayoutKey ?? format.previewLayoutKey ?? 'document';

  return {
    ext: format.ext,
    category: format.category,
    subtype: format.subtype,
    mime: format.mime,
    highlightLanguage: format.highlightLanguage,
    canPreview: true,
    canQuickLook: merged.quickLook?.enabled ?? false,
    fileAssociation: merged.fileAssociation ?? false,
    previewLayoutKey,
    previewLayout: PREVIEW_LAYOUTS[previewLayoutKey] ?? PREVIEW_LAYOUTS.document,
  };
}

/**
 * All built-in formats with resolved platform capabilities.
 * @returns {NonNullable<ReturnType<typeof resolvePlatformCapability>>[]}
 */
export function listPlatformCapabilities() {
  return listBuiltinExtensions()
    .map((ext) => resolvePlatformCapability(ext))
    .filter(Boolean);
}

/**
 * Built-in formats with actively enabled Finder preview (subset of union).
 * @returns {NonNullable<ReturnType<typeof resolvePlatformCapability>>[]}
 */
export function listQuickLookFormats() {
  return listPlatformCapabilities().filter((cap) => cap.canQuickLook);
}

/**
 * Full Finder admission UTI set (static union) — for Info.plist codegen.
 * @returns {string[]}
 */
export function listQuickLookUtis() {
  return listQuickLookUnionUtis();
}

/**
 * UTImportedTypeDeclarations for the Finder union.
 * @returns {ReturnType<typeof listDeclaredUnionUtis>}
 */
export function listDeclaredQuickLookUtis() {
  return listDeclaredUnionUtis();
}

/**
 * File extensions for Tauri fileAssociations bundle config.
 * @returns {string[]}
 */
export function listFileAssociationExtensions() {
  if (Array.isArray(FILE_ASSOCIATION_EXTENSIONS)) {
    return [...FILE_ASSOCIATION_EXTENSIONS].sort();
  }

  const exts = listPlatformCapabilities()
    .filter((cap) => cap.fileAssociation)
    .map((cap) => cap.ext);

  // 内置插件（如 HDF5）也注册为双击打开的文件关联。
  for (const ext of BUILTIN_PLUGIN_EXTENSIONS) {
    if (!exts.includes(ext)) {
      exts.push(ext);
    }
  }

  return exts.sort();
}

/**
 * MIME types for Quick Look union (all admission slots).
 * @returns {Record<string, string>}
 */
export function getQuickLookMimeTypes() {
  return getQuickLookUnionMimeTypes();
}

export {
  BUILTIN_FORMATS,
  buildPreviewRegistry,
  getQuickLookUnionLayoutKeys,
  isQuickLookActiveForExt,
  listQuickLookActiveExtensions,
  listQuickLookUnionEntries,
  listQuickLookUnionExtensions,
};
