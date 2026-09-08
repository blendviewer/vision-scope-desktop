/**
 * Resolve Finder Quick Look union (static admission) and runtime preview registry (active capabilities).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BUILTIN_FORMATS,
  PREVIEW_LAYOUTS,
  getBuiltinFormat,
} from '@blendviewer/vision-scope/formats';

import {
  BUILTIN_PLUGIN_EXTENSIONS,
  CODE_QUICKLOOK_CONTENT_TYPES,
  CUSTOM_UTI_DECLARATIONS,
  PLUGIN_UNION_SLOTS,
  QUICKLOOK_EXCLUDED_CATEGORIES,
  QUICKLOOK_EXCLUDED_EXTENSIONS,
  customPreviewUti,
  lookupCustomUtiDeclaration,
  lookupSystemUti,
} from './quickLookUnion.js';

import {
  PLATFORM_BY_CATEGORY,
  PLATFORM_BY_EXT,
  PLATFORM_BY_SUBTYPE,
} from './platformFormats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = join(__dirname, '..', '..', '..');
const PLUGIN_PACKAGES_DIR = join(MONOREPO_ROOT, 'packages');

/** @typedef {import('./quickLookUnion.js').QuickLookUnionEntry} QuickLookUnionEntry */

/**
 * @param {string} ext
 * @returns {boolean}
 */
export function isQuickLookUnionCandidate(ext) {
  if (QUICKLOOK_EXCLUDED_EXTENSIONS.has(ext)) {
    return false;
  }
  if (PLUGIN_UNION_SLOTS[ext]) {
    return true;
  }
  const format = getBuiltinFormat(ext);
  if (!format) {
    return false;
  }
  return !QUICKLOOK_EXCLUDED_CATEGORIES.has(format.category);
}

/**
 * @param {string} ext
 * @param {{ pluginId?: string, mime?: string }} [pluginMeta]
 * @returns {QuickLookUnionEntry}
 */
export function resolveUnionEntryForExt(ext, pluginMeta) {
  const pluginSlot = PLUGIN_UNION_SLOTS[ext] ?? pluginMeta;
  const format = getBuiltinFormat(ext);

  if (pluginSlot?.pluginId) {
    const systemUti = lookupSystemUti(ext);
    const customDecl = lookupCustomUtiDeclaration(ext);
    const uti = systemUti ?? customDecl?.uti ?? customPreviewUti(ext);
    return {
      ext,
      uti,
      declareUti: !!customDecl?.declareUti,
      description: customDecl?.description,
      conformsTo: customDecl?.conformsTo,
      slot: 'plugin',
      pluginId: pluginSlot.pluginId,
      mime: pluginMeta?.mime ?? format?.mime,
    };
  }

  const customDecl = lookupCustomUtiDeclaration(ext);
  if (customDecl) {
    return {
      ext,
      uti: customDecl.uti,
      declareUti: true,
      description: customDecl.description,
      conformsTo: customDecl.conformsTo,
      slot: 'builtin',
      mime: format?.mime,
    };
  }

  const systemUti = lookupSystemUti(ext);
  if (systemUti) {
    return {
      ext,
      uti: systemUti,
      slot: 'builtin',
      mime: format?.mime,
      ...(format?.category === 'code'
        ? { contentTypes: CODE_QUICKLOOK_CONTENT_TYPES }
        : {}),
    };
  }

  const uti = customPreviewUti(ext);
  return {
    ext,
    uti,
    declareUti: true,
    description: `VisionScope Preview (${ext})`,
    conformsTo: ['public.data'],
    slot: 'builtin',
    mime: format?.mime,
  };
}

/**
 * Scan vision-*-plugin manifests for scopeExtension formats (union slots).
 * @returns {Array<{ ext: string, pluginId: string, mime?: string }>}
 */
export function scanPluginUnionFormats() {
  /** @type {Array<{ ext: string, pluginId: string, mime?: string }>} */
  const found = [];

  let entries = [];
  try {
    entries = readdirSync(PLUGIN_PACKAGES_DIR);
  } catch {
    return found;
  }

  for (const name of entries) {
    if (!name.startsWith('vision-') || !name.endsWith('-plugin')) {
      continue;
    }
    const manifestPath = join(PLUGIN_PACKAGES_DIR, name, 'manifest.json');
    try {
      statSync(manifestPath);
    } catch {
      continue;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const pluginId = manifest.id;
    const formats = manifest.scopeExtension?.formats;
    if (!pluginId || !Array.isArray(formats)) {
      continue;
    }

    for (const format of formats) {
      if (!format?.ext) {
        continue;
      }
      found.push({
        ext: String(format.ext).toLowerCase(),
        pluginId,
        mime: format.mime,
      });
    }
  }

  return found;
}

/**
 * Maximal Finder Quick Look admission union — all extension/UTI slots.
 * @returns {QuickLookUnionEntry[]}
 */
export function listQuickLookUnionEntries() {
  /** @type {Map<string, QuickLookUnionEntry>} */
  const byExt = new Map();

  for (const ext of Object.keys(BUILTIN_FORMATS)) {
    if (!isQuickLookUnionCandidate(ext)) {
      continue;
    }
    byExt.set(ext, resolveUnionEntryForExt(ext));
  }

  for (const [ext, slot] of Object.entries(PLUGIN_UNION_SLOTS)) {
    if (!byExt.has(ext)) {
      byExt.set(ext, resolveUnionEntryForExt(ext, slot));
    } else {
      const existing = byExt.get(ext);
      byExt.set(ext, {
        ...existing,
        slot: 'plugin',
        pluginId: slot.pluginId,
      });
    }
  }

  for (const pluginFormat of scanPluginUnionFormats()) {
    if (!isQuickLookUnionCandidate(pluginFormat.ext) && !PLUGIN_UNION_SLOTS[pluginFormat.ext]) {
      // Plugin-only extension not in BUILTIN — still add union slot
    }
    const existing = byExt.get(pluginFormat.ext);
    if (existing) {
      byExt.set(pluginFormat.ext, {
        ...existing,
        slot: 'plugin',
        pluginId: pluginFormat.pluginId,
        mime: pluginFormat.mime ?? existing.mime,
      });
    } else if (!QUICKLOOK_EXCLUDED_EXTENSIONS.has(pluginFormat.ext)) {
      byExt.set(
        pluginFormat.ext,
        resolveUnionEntryForExt(pluginFormat.ext, pluginFormat),
      );
    }
  }

  return [...byExt.values()].sort((a, b) => a.ext.localeCompare(b.ext));
}

/**
 * Whether built-in platform overlay currently enables Finder preview for this ext.
 * Independent of the union — union is admission; this is active capability.
 * @param {string} ext
 */
export function isQuickLookActiveForExt(ext) {
  const format = getBuiltinFormat(ext);
  if (!format) {
    return false;
  }

  const merged = {
    ...PLATFORM_BY_CATEGORY[format.category],
    ...PLATFORM_BY_SUBTYPE[format.subtype],
    ...PLATFORM_BY_EXT[format.ext],
  };

  return merged.quickLook?.enabled ?? false;
}

/**
 * @param {string} ext
 */
function resolvePreviewLayoutKey(ext) {
  const format = getBuiltinFormat(ext);
  if (!format) {
    return 'document';
  }
  const merged = {
    ...PLATFORM_BY_CATEGORY[format.category],
    ...PLATFORM_BY_SUBTYPE[format.subtype],
    ...PLATFORM_BY_EXT[format.ext],
  };
  return merged.previewLayoutKey ?? format.previewLayoutKey ?? 'document';
}

/**
 * Runtime preview registry — maps union slots to currently active handlers.
 * Shipped inside the .appex; App Group overlay may extend at runtime later.
 * @returns {{ version: number, unionVersion: number, formats: Record<string, object> }}
 */
export function buildPreviewRegistry() {
  const union = listQuickLookUnionEntries();

  /** @type {Record<string, object>} */
  const formats = {};

  for (const entry of union) {
    const layoutKey = resolvePreviewLayoutKey(entry.ext);
    const format = getBuiltinFormat(entry.ext);
    const active =
      entry.slot === 'plugin'
        ? BUILTIN_PLUGIN_EXTENSIONS.has(entry.ext)
        : isQuickLookActiveForExt(entry.ext);

    formats[entry.ext] = {
      enabled: active,
      slot: entry.slot,
      uti: entry.uti,
      mime: entry.mime ?? format?.mime ?? 'application/octet-stream',
      layout: layoutKey,
      previewLayout: PREVIEW_LAYOUTS[layoutKey] ?? PREVIEW_LAYOUTS.document,
      ...(entry.pluginId ? { pluginId: entry.pluginId, requiredPlugin: entry.pluginId } : {}),
      source: active ? 'builtin' : entry.slot === 'plugin' ? 'plugin' : 'union',
    };
  }

  return {
    version: 1,
    unionVersion: union.length,
    formats,
  };
}

/**
 * All UTIs for QLSupportedContentTypes (full union).
 * @returns {string[]}
 */
export function listQuickLookUnionUtis() {
  const utis = new Set(CODE_QUICKLOOK_CONTENT_TYPES);

  for (const entry of listQuickLookUnionEntries()) {
    utis.add(entry.uti);
    for (const uti of entry.contentTypes ?? []) {
      utis.add(uti);
    }
  }

  return [...utis].sort();
}

/**
 * UTImportedTypeDeclarations from union custom UTIs.
 * @returns {Array<{ uti: string, description: string, conformsTo: string[], extensions: string[] }>}
 */
export function listDeclaredUnionUtis() {
  /** @type {Map<string, { uti: string, description: string, conformsTo: string[], extensions: string[] }>} */
  const byUti = new Map();

  for (const [uti, decl] of Object.entries(CUSTOM_UTI_DECLARATIONS)) {
    byUti.set(uti, {
      uti,
      description: decl.description,
      conformsTo: decl.conformsTo,
      extensions: [...decl.extensions].sort(),
    });
  }

  for (const entry of listQuickLookUnionEntries()) {
    if (!entry.declareUti || CUSTOM_UTI_DECLARATIONS[entry.uti]) {
      continue;
    }

    const existing = byUti.get(entry.uti) ?? {
      uti: entry.uti,
      description: entry.description ?? entry.uti,
      conformsTo: entry.conformsTo ?? ['public.data'],
      extensions: [],
    };

    if (!existing.extensions.includes(entry.ext)) {
      existing.extensions.push(entry.ext);
    }

    byUti.set(entry.uti, {
      ...existing,
      extensions: [...existing.extensions].sort(),
    });
  }

  return [...byUti.values()].sort((a, b) => a.uti.localeCompare(b.uti));
}

/**
 * MIME types for all union entries (Swift scheme handler fallback).
 * @returns {Record<string, string>}
 */
export function getQuickLookUnionMimeTypes() {
  /** @type {Record<string, string>} */
  const mimeTypes = {};
  for (const entry of listQuickLookUnionEntries()) {
    const format = getBuiltinFormat(entry.ext);
    mimeTypes[entry.ext] = entry.mime ?? format?.mime ?? 'application/octet-stream';
  }
  return mimeTypes;
}

/**
 * Layout groups for all union entries.
 * @returns {Record<string, string>}
 */
export function getQuickLookUnionLayoutKeys() {
  /** @type {Record<string, string>} */
  const layouts = {};
  for (const entry of listQuickLookUnionEntries()) {
    layouts[entry.ext] = resolvePreviewLayoutKey(entry.ext);
  }
  return layouts;
}

/**
 * Extensions in the static Finder union (admission set).
 * @returns {string[]}
 */
export function listQuickLookUnionExtensions() {
  return listQuickLookUnionEntries().map((entry) => entry.ext);
}

/**
 * Extensions with active built-in Finder preview (subset of union).
 * @returns {string[]}
 */
export function listQuickLookActiveExtensions() {
  return listQuickLookUnionEntries()
    .filter((entry) => entry.slot !== 'plugin' && isQuickLookActiveForExt(entry.ext))
    .map((entry) => entry.ext);
}
