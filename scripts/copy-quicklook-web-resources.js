#!/usr/bin/env node
/**
 * Copy a slim web bundle into Quick Look .appex (no main/preview entries, no source maps).
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(__dirname, '..');
const distDir = resolve(appDir, 'dist');
const outDir = resolve(appDir, 'quicklook/VisionScopeQuickLook/Resources/web');

/** @param {string} rel POSIX path relative to dist root */
function shouldCopy(rel) {
  if (!rel || rel.startsWith('.')) return false;
  if (rel.endsWith('.map')) return false;
  if (rel === 'index.html' || rel === 'preview.html') return false;

  if (
    rel === 'quicklook.html' ||
    rel === 'preview-registry.json' ||
    rel === 'linglong-logo.svg'
  ) {
    return true;
  }

  if (
    rel.startsWith('nestcad-envmaps/') ||
    rel.startsWith('nestcad-loaders/') ||
    rel.startsWith('styles/') ||
    rel.startsWith('ui-styles/')
  ) {
    return true;
  }

  if (!rel.startsWith('assets/')) return false;

  const name = basename(rel);
  if (/^main-/.test(name)) return false;
  if (/^preview-/.test(name) && !/^preview-core-/.test(name)) return false;

  if (
    /^quicklook-.*\.js$/.test(name) ||
    /^preview-core-.*\.js$/.test(name) ||
    /^registerHdf5Extension-.*\.js$/.test(name) ||
    /^vision-hdf5-plugin-.*\.js$/.test(name) ||
    name === 'vision-hdf5-plugin.css' ||
    /^vision-scope-.*\.(js|css)$/.test(name) ||
    /^tabularPreview-.*\.js$/.test(name) ||
    name === 'duckdb-eh.wasm' ||
    name === 'duckdb-browser-eh.worker.js' ||
    name === 'duckdb-tabular.js' ||
    name === 'duckdb-tabular.css' ||
    /^sql-wasm.*\.wasm$/.test(name)
  ) {
    return true;
  }

  return false;
}

/** @param {string} dir */
function walkDist(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = relative(distDir, full).split('\\').join('/');
    if (entry.isDirectory()) {
      walkDist(full, files);
    } else if (shouldCopy(rel)) {
      files.push({ rel, full });
    }
  }
  return files;
}

function main() {
  if (!statSync(distDir, { throwIfNoEntry: false })?.isDirectory()) {
    console.error('错误: dist/ 不存在，请先 pnpm build');
    process.exit(1);
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const files = walkDist(distDir);
  if (files.length === 0) {
    console.error('错误: 未找到可拷贝的 Quick Look 资源');
    process.exit(1);
  }

  let bytes = 0;
  for (const { rel, full } of files) {
    const target = join(outDir, rel);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(full, target);
    bytes += statSync(full).size;
  }

  const htmlPath = join(outDir, 'quicklook.html');
  const html = readFileSync(htmlPath, 'utf8').replace(/ crossorigin/g, '');
  writeFileSync(htmlPath, html);

  const mb = (bytes / (1024 * 1024)).toFixed(1);
  console.log(`Quick Look web 资源已拷贝: ${files.length} 个文件, ${mb} MB`);
  console.log(`  源: ${distDir}`);
  console.log(`  目标: ${outDir}`);
}

main();
