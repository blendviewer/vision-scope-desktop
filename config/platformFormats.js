/**
 * Desktop platform overlay — Quick Look active flags, file associations, layout overrides.
 * Semantic format data comes from @blendviewer/vision-scope/formats.
 *
 * Finder UTI admission (max union) lives in config/quickLookUnion.js — NOT here.
 * This file only controls which union slots are *actively* previewable at build time.
 *
 * ## 如何启用/关闭 Finder 预览能力
 *
 * - 整类格式：`PLATFORM_BY_CATEGORY` 里设 `quickLook.enabled`
 * - 单个扩展名：`PLATFORM_BY_EXT` 里设 `quickLook.enabled: true`
 * - 扩大 Finder 并集（新 UTI 槽位）：改 config/quickLookUnion.js
 *
 * 改完后运行 `pnpm generate:quicklook`。
 */

/** @typedef {import('@blendviewer/vision-scope/formats').PreviewLayoutKey} PreviewLayoutKey */

/**
 * @typedef {object} QuickLookActiveConfig
 * @property {boolean} enabled
 */

/**
 * @typedef {object} PlatformCapability
 * @property {QuickLookActiveConfig} [quickLook]
 * @property {boolean} [fileAssociation]
 * @property {PreviewLayoutKey} [previewLayoutKey]
 */

/** @type {Record<string, PlatformCapability>} */
export const PLATFORM_BY_CATEGORY = {
  code: {
    quickLook: { enabled: true },
    fileAssociation: true,
    previewLayoutKey: 'document',
  },
  document: {
    quickLook: { enabled: false },
    fileAssociation: true,
    previewLayoutKey: 'document',
  },
  image: {
    quickLook: { enabled: false },
    fileAssociation: true,
    previewLayoutKey: 'image',
  },
  texture: {
    quickLook: { enabled: false },
    fileAssociation: true,
    previewLayoutKey: 'texture',
  },
  media: {
    quickLook: { enabled: false },
    fileAssociation: false,
    previewLayoutKey: 'media',
  },
  spatial: {
    quickLook: { enabled: false },
    fileAssociation: true,
  },
  tabular: {
    quickLook: { enabled: false },
    fileAssociation: true,
    previewLayoutKey: 'tabular',
  },
  presentation: {
    quickLook: { enabled: false },
    fileAssociation: true,
    previewLayoutKey: 'presentation',
  },
  archive: {
    quickLook: { enabled: false },
    fileAssociation: false,
    previewLayoutKey: 'archive',
  },
  scientific: {
    quickLook: { enabled: true },
    fileAssociation: true,
    previewLayoutKey: 'document',
  },
};

/** @type {Record<string, Partial<PlatformCapability>>} */
export const PLATFORM_BY_SUBTYPE = {
  model3d: { previewLayoutKey: 'spatial_3d' },
  animation: { previewLayoutKey: 'spatial_3d' },
  bim: { previewLayoutKey: 'spatial_cad' },
  cad: { previewLayoutKey: 'spatial_cad' },
  pointcloud: { previewLayoutKey: 'point_cloud' },
  gpu: { previewLayoutKey: 'texture' },
};

/**
 * Per-extension Finder preview activation (must have a slot in quickLookUnion.js).
 *
 * @type {Record<string, Partial<PlatformCapability>>}
 */
export const PLATFORM_BY_EXT = {
  txt: { quickLook: { enabled: true } },
  md: { quickLook: { enabled: true } },
  glb: { quickLook: { enabled: true } },
  gltf: { quickLook: { enabled: true } },
  obj: { quickLook: { enabled: true } },
  stl: { quickLook: { enabled: true } },
  fbx: { quickLook: { enabled: true } },
  usdz: { quickLook: { enabled: true } },
  dae: { quickLook: { enabled: true } },
  ply: { quickLook: { enabled: true } },
  pdb: { quickLook: { enabled: true } },
  dwg: { quickLook: { enabled: true } },
  dxf: { quickLook: { enabled: true } },
  ifc: { quickLook: { enabled: true } },
  step: { quickLook: { enabled: true } },
  stp: { quickLook: { enabled: true } },
  iges: { quickLook: { enabled: true } },
  igs: { quickLook: { enabled: true } },
  brep: { quickLook: { enabled: true } },
  brp: { quickLook: { enabled: true } },
  pcd: { quickLook: { enabled: true } },
  las: { quickLook: { enabled: true } },
  laz: { quickLook: { enabled: true } },
  ktx2: { quickLook: { enabled: true } },
  csv: { quickLook: { enabled: true } },
  tsv: { quickLook: { enabled: true } },
  parquet: { quickLook: { enabled: true } },
  jsonl: { quickLook: { enabled: true } },
  ndjson: { quickLook: { enabled: true } },
  arrow: { quickLook: { enabled: true } },
  feather: { quickLook: { enabled: true } },
  avro: { quickLook: { enabled: true } },
  db: { quickLook: { enabled: true } },
  sqlite: { quickLook: { enabled: true } },
  sqlite3: { quickLook: { enabled: true } },
};

/**
 * 设为 `null`：按上方 PLATFORM_BY_* 自动推导文件关联。
 * 设为 `string[]`：仅注册列表中的扩展名（覆盖 category 默认）。
 *
 * @type {string[] | null}
 */
export const FILE_ASSOCIATION_EXTENSIONS = null;
