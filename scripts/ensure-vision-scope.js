import { existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const monorepoRoot = resolve(appRoot, '../..');
const scopeDist = resolve(appRoot, '../../packages/vision-scope/dist');

const requiredFiles = [
  'index.js',
  'duckdb-eh.wasm',
  'duckdb-browser-eh.worker.js',
  'duckdb-tabular.js',
  'duckdb-tabular.css',
  'sql-wasm.wasm',
];

const requiredDirs = [
  'nestcad-envmaps',
  'nestcad-loaders/loaders',
  'styles',
  'ui-styles',
];

function dirHasEntries(relativeDir) {
  const full = resolve(scopeDist, relativeDir);
  if (!existsSync(full)) {
    return false;
  }
  return readdirSync(full).length > 0;
}

function isDistComplete() {
  for (const file of requiredFiles) {
    if (!existsSync(resolve(scopeDist, file))) {
      return false;
    }
  }
  for (const dir of requiredDirs) {
    if (!dirHasEntries(dir)) {
      return false;
    }
  }
  return true;
}

if (isDistComplete()) {
  console.log('[ensure-vision-scope] dist assets present, skipping build');
  process.exit(0);
}

console.log('[ensure-vision-scope] dist incomplete, building @blendviewer/vision-scope...');

const result = spawnSync('pnpm', ['--filter', '@blendviewer/vision-scope', 'run', 'build'], {
  cwd: monorepoRoot,
  stdio: 'inherit',
  shell: true,
});

if (result.status !== 0) {
  console.error('[ensure-vision-scope] build failed');
  process.exit(result.status ?? 1);
}

if (!isDistComplete()) {
  console.error('[ensure-vision-scope] build finished but required dist assets are still missing');
  process.exit(1);
}

console.log('[ensure-vision-scope] build complete');
