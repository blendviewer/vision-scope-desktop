/**
 * macOS Finder Quick Look — maximal static admission union (UTI + extension slots).
 *
 * This is NOT the app-internal supported-format set (see @blendviewer/vision-scope/formats
 * and scopeExtension plugins). It only defines which file types macOS may route to our .appex.
 *
 * Releases and plugins map capabilities onto existing slots here; add new slots in this file
 * when expanding Finder coverage (requires rebuild + re-sign of the Quick Look extension).
 */

/** @typedef {object} QuickLookUnionEntry
 * @property {string} ext
 * @property {string} uti Primary UTI for QLSupportedContentTypes
 * @property {string[]} [contentTypes] Extra macOS UTIs (e.g. code languages)
 * @property {boolean} [declareUti] Emit UTImportedTypeDeclarations
 * @property {string} [description]
 * @property {string[]} [conformsTo]
 * @property {'builtin'|'plugin'} slot
 * @property {string} [pluginId] When slot is plugin
 * @property {string} [mime] Override when not in BUILTIN_FORMATS
 */

/** Categories handled well by macOS — do not claim in our Quick Look extension. */
export const QUICKLOOK_EXCLUDED_CATEGORIES = new Set(['image', 'media']);

/** Extensions with system-owned or conflict-prone Quick Look routing. */
export const QUICKLOOK_EXCLUDED_EXTENSIONS = new Set(['pdf', 'html', 'htm']);

/**
 * macOS LaunchServices UTIs for extensions with stable system identifiers.
 * @type {Record<string, string>}
 */
export const SYSTEM_UTI_BY_EXT = {
  txt: 'public.plain-text',
  md: 'net.daringfireball.markdown',
  doc: 'com.microsoft.word.doc',
  docx: 'org.openxmlformats.wordprocessingml.document',
  xls: 'com.microsoft.excel.xls',
  xlsx: 'org.openxmlformats.spreadsheetml.sheet',
  ods: 'org.oasis-open.opendocument.spreadsheet',
  ppt: 'com.microsoft.powerpoint.ppt',
  pptx: 'org.openxmlformats-officedocument.presentationml.presentation',
  json: 'public.json',
  ndjson: 'public.ndjson',
  xml: 'public.xml',
  yaml: 'public.yaml',
  yml: 'public.yaml',
  css: 'public.css',
  js: 'com.netscape.javascript-source',
  mjs: 'com.netscape.javascript-source',
  cjs: 'com.netscape.javascript-source',
  jsx: 'com.netscape.javascript-source',
  ts: 'com.microsoft.typescript',
  tsx: 'com.microsoft.typescript',
  py: 'public.python-script',
  rb: 'public.ruby-script',
  php: 'public.php-script',
  java: 'com.sun.java-source',
  c: 'public.c-source',
  cpp: 'public.c-plus-plus-source',
  cs: 'public.c-sharp-source',
  go: 'com.golang.source',
  rs: 'public.rust-source',
  sh: 'public.shell-script',
  bash: 'public.shell-script',
  zsh: 'public.shell-script',
  sql: 'public.sql-script',
  dockerfile: 'public.dockerfile',
  makefile: 'public.make-source',
  log: 'com.apple.log',
  glb: 'org.khronos.glb',
  gltf: 'org.khronos.gltf',
  obj: 'public.geometry-definition-format',
  stl: 'public.standard-tesselated-geometry-format',
  usdz: 'com.pixar.universal-scene-description-mobile',
  dae: 'org.khronos.collada.digital-asset-exchange',
  ply: 'public.polygon-file-format',
  dcm: 'org.nema.dicom',
  dicom: 'org.nema.dicom',
  zip: 'public.zip-archive',
  tar: 'public.tar-archive',
  gz: 'org.gnu.gnu-zip-archive',
  '7z': 'org.7-zip.7-zip-archive',
  rar: 'org.rarlab.rar-archive',
};

/**
 * Custom exported UTIs (declareUti) — grouped by UTI id.
 * @type {Record<string, { description: string, conformsTo: string[], extensions: string[] }>}
 */
export const CUSTOM_UTI_DECLARATIONS = {
  'com.blendviewer.visionscope.preview.source': {
    description: 'VisionScope Source Code',
    conformsTo: ['public.plain-text', 'public.source-code'],
    extensions: [
      'graphql',
      'kt',
      'less',
      'sass',
      'scss',
      'toml',
    ],
  },
  'com.blendviewer.visionscope.preview.fbx': {
    description: 'Autodesk FBX',
    conformsTo: ['public.data', 'public.3d-content'],
    extensions: ['fbx'],
  },
  'com.blendviewer.visionscope.preview.dwg': {
    description: 'AutoCAD DWG',
    conformsTo: ['public.data'],
    extensions: ['dwg'],
  },
  'com.blendviewer.visionscope.preview.dxf': {
    description: 'AutoCAD DXF',
    conformsTo: ['public.data'],
    extensions: ['dxf'],
  },
  'com.blendviewer.visionscope.preview.ifc': {
    description: 'Industry Foundation Classes',
    conformsTo: ['public.data'],
    extensions: ['ifc'],
  },
  'com.blendviewer.visionscope.preview.step': {
    description: 'STEP CAD Exchange',
    conformsTo: ['public.data'],
    extensions: ['step', 'stp'],
  },
  'com.blendviewer.visionscope.preview.iges': {
    description: 'IGES CAD Exchange',
    conformsTo: ['public.data'],
    extensions: ['iges', 'igs'],
  },
  'com.blendviewer.visionscope.preview.brep': {
    description: 'Open CASCADE BREP',
    conformsTo: ['public.data'],
    extensions: ['brep', 'brp'],
  },
  'com.blendviewer.visionscope.preview.pcd': {
    description: 'Point Cloud Data',
    conformsTo: ['public.data'],
    extensions: ['pcd'],
  },
  'com.blendviewer.visionscope.preview.las': {
    description: 'LiDAR LAS Point Cloud',
    conformsTo: ['public.data'],
    extensions: ['las'],
  },
  'com.blendviewer.visionscope.preview.laz': {
    description: 'Compressed LiDAR LAZ Point Cloud',
    conformsTo: ['public.data'],
    extensions: ['laz'],
  },
  'com.blendviewer.visionscope.preview.ktx2': {
    description: 'Khronos KTX2 Texture',
    conformsTo: ['public.data'],
    extensions: ['ktx2'],
  },
  'com.blendviewer.visionscope.preview.basis': {
    description: 'Basis Universal Texture',
    conformsTo: ['public.data'],
    extensions: ['basis'],
  },
  'com.blendviewer.visionscope.preview.3ds': {
    description: '3D Studio Mesh',
    conformsTo: ['public.data', 'public.3d-content'],
    extensions: ['3ds'],
  },
  'com.blendviewer.visionscope.preview.3dm': {
    description: 'Rhino 3D Model',
    conformsTo: ['public.data', 'public.3d-content'],
    extensions: ['3dm'],
  },
  'com.blendviewer.visionscope.preview.3mf': {
    description: '3D Manufacturing Format',
    conformsTo: ['public.data', 'public.3d-content'],
    extensions: ['3mf'],
  },
  'com.blendviewer.visionscope.preview.gcode': {
    description: 'G-code Toolpath',
    conformsTo: ['public.plain-text', 'public.data'],
    extensions: ['gcode'],
  },
  'com.blendviewer.visionscope.preview.kmz': {
    description: 'Google Earth KMZ',
    conformsTo: ['public.data'],
    extensions: ['kmz'],
  },
  'com.blendviewer.visionscope.preview.vrml': {
    description: 'VRML 3D Model',
    conformsTo: ['public.data', 'public.3d-content'],
    extensions: ['vrml', 'wrl'],
  },
  'com.blendviewer.visionscope.preview.vtk': {
    description: 'VTK Dataset',
    conformsTo: ['public.data'],
    extensions: ['vtk', 'vtp'],
  },
  'com.blendviewer.visionscope.preview.parquet': {
    description: 'Apache Parquet Table',
    conformsTo: ['public.data'],
    extensions: ['parquet'],
  },
  'com.blendviewer.visionscope.preview.hdf5': {
    description: 'HDF5 Scientific Data',
    conformsTo: ['public.data'],
    extensions: ['h5', 'hdf5'],
  },
  'com.blendviewer.visionscope.preview.csv': {
    description: 'Comma Separated Values Table',
    conformsTo: ['public.comma-separated-values-text', 'public.plain-text', 'public.data'],
    extensions: ['csv'],
  },
  'com.blendviewer.visionscope.preview.tsv': {
    description: 'Tab Separated Values Table',
    conformsTo: ['public.tab-separated-values-text', 'public.plain-text', 'public.data'],
    extensions: ['tsv'],
  },
  'com.blendviewer.visionscope.preview.kicad': {
    description: 'KiCad Design File',
    conformsTo: ['public.data', 'public.plain-text'],
    extensions: ['kicad_sch', 'kicad_pcb', 'kicad_pro', 'kicad_wks'],
  },
  'com.blendviewer.visionscope.preview.pdb': {
    description: 'Protein Data Bank',
    conformsTo: ['public.data', 'public.3d-content'],
    extensions: ['pdb'],
  },
};

/**
 * Extra system UTIs registered for code routing (macOS-assigned per language).
 * Included in QLSupportedContentTypes alongside per-ext UTIs.
 */
export const CODE_QUICKLOOK_CONTENT_TYPES = [
  'com.netscape.javascript-source',
  'com.microsoft.typescript',
  'com.sun.java-source',
  'public.python-script',
  'public.ruby-script',
  'public.php-script',
  'public.c-plus-plus-source',
  'public.c-source',
  'public.c-sharp-source',
  'public.shell-script',
  'public.json',
  'public.css',
  'public.yaml',
  'public.xml',
  'public.source-code',
  'public.script',
  'public.sql-script',
  'com.apple.log',
  'com.golang.source',
  'public.rust-source',
  'public.make-source',
  'public.dockerfile',
  'com.blendviewer.visionscope.preview.source',
];

/**
 * Plugin catalog slots in the Finder union (may be disabled until plugin is installed).
 * @type {Record<string, { pluginId: string, mime?: string }>}
 */
export const PLUGIN_UNION_SLOTS = {
  docx: { pluginId: 'com.blendviewer.vision-docx' },
  h5: { pluginId: 'com.blendviewer.vision-hdf5' },
  hdf5: { pluginId: 'com.blendviewer.vision-hdf5' },
  kicad_sch: { pluginId: 'com.blendviewer.vision-kicanvas' },
  kicad_pcb: { pluginId: 'com.blendviewer.vision-kicanvas' },
  kicad_pro: { pluginId: 'com.blendviewer.vision-kicanvas' },
  kicad_wks: { pluginId: 'com.blendviewer.vision-kicanvas' },
};

/**
 * Extensions whose scope-extension plugin is **bundled into the desktop app**
 * (independent bundle inlined at build time), so their Finder/space preview is
 * always enabled — no external plugin install required.
 *
 * These still live in `PLUGIN_UNION_SLOTS` (they are plugin-backed, not in
 * BUILTIN_FORMATS), but `buildPreviewRegistry()` treats them as active.
 * @type {Set<string>}
 */
export const BUILTIN_PLUGIN_EXTENSIONS = new Set(['h5', 'hdf5']);

/** @param {string} ext */
export function customPreviewUti(ext) {
  return `com.blendviewer.visionscope.preview.${ext.replace(/[^a-z0-9]+/gi, '_')}`;
}

/** @param {string} ext */
export function lookupSystemUti(ext) {
  return SYSTEM_UTI_BY_EXT[ext];
}

/** @param {string} ext */
export function lookupCustomUtiDeclaration(ext) {
  for (const [uti, decl] of Object.entries(CUSTOM_UTI_DECLARATIONS)) {
    if (decl.extensions.includes(ext)) {
      return { uti, ...decl, declareUti: true };
    }
  }
  return null;
}
