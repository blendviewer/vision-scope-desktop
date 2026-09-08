/**
 * Ensure ~/.cargo/bin is on PATH before invoking tauri CLI.
 * Rust is often installed but not visible to IDE terminals until PATH is updated.
 */
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
const pathSep = process.platform === 'win32' ? ';' : ':';

const env = { ...process.env };
const currentPath = env[pathKey] ?? '';
if (!currentPath.split(pathSep).some((entry) => entry.toLowerCase() === cargoBin.toLowerCase())) {
  env[pathKey] = `${cargoBin}${pathSep}${currentPath}`;
}

const args = process.argv.slice(2);
const tauriArgs = args.length > 0 ? args : ['dev'];

const result = spawnSync('pnpm', ['exec', 'tauri', ...tauriArgs], {
  cwd: appRoot,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
