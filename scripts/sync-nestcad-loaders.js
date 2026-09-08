import { cpSync, mkdirSync, rmSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, '..');
const sourceDir = resolve(appRoot, '../../packages/nestcad-viewer/libs/loaders');
const publicDir = resolve(appRoot, 'public/nestcad-loaders/loaders');

rmSync(publicDir, { recursive: true, force: true });
mkdirSync(publicDir, { recursive: true });
cpSync(sourceDir, publicDir, { recursive: true });

console.log(`Synced nestcad loaders: ${sourceDir} -> ${publicDir}`);
