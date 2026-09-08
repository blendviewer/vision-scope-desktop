import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const pluginRoot = resolve(appRoot, '../../packages/vision-hdf5-plugin');
const distEntry = resolve(pluginRoot, 'dist/index.js');

if (existsSync(distEntry)) {
  console.log('[ensure-hdf5-plugin] dist/index.js present, skipping build');
  process.exit(0);
}

console.log('[ensure-hdf5-plugin] dist/index.js missing, building @blendviewer/vision-hdf5-plugin...');

const result = spawnSync('pnpm', ['exec', 'vite', 'build'], {
  cwd: pluginRoot,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    BUILD_LIB: 'true',
  },
});

if (result.status !== 0) {
  console.error('[ensure-hdf5-plugin] build failed');
  process.exit(result.status ?? 1);
}

if (!existsSync(distEntry)) {
  console.error('[ensure-hdf5-plugin] build finished but dist/index.js is still missing');
  process.exit(1);
}

console.log('[ensure-hdf5-plugin] build complete');
