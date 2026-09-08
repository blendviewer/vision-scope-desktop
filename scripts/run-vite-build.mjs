/**
 * Cross-platform frontend production build (sets NODE_ENV without bash syntax).
 */
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const result = spawnSync('pnpm', ['exec', 'vite', 'build'], {
  cwd: appRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    NODE_ENV: 'production',
  },
});

process.exit(result.status ?? 1);
