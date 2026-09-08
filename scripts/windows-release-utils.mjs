/**
 * Shared helpers for Windows release artifact discovery and archiving.
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { appRoot } from './load-windows-env.mjs';

const tauriRoot = path.join(appRoot, 'src-tauri');

export function readAppVersion() {
  const pkg = JSON.parse(readFileSync(path.join(appRoot, 'package.json'), 'utf8'));
  return pkg.version ?? '0.0.0';
}

export function readProductName() {
  const conf = JSON.parse(readFileSync(path.join(tauriRoot, 'tauri.conf.json'), 'utf8'));
  return conf.productName ?? 'VisionScope';
}

export function resolveReleaseDir(buildTarget) {
  const targetRoot = path.join(tauriRoot, 'target');
  if (buildTarget) {
    return path.join(targetRoot, buildTarget, 'release');
  }
  return path.join(targetRoot, 'release');
}

export function detectArchTag(releaseDir, buildTarget) {
  if (buildTarget.includes('i686')) {
    return 'x86';
  }
  if (buildTarget.includes('aarch64')) {
    return 'arm64';
  }
  if (process.arch === 'arm64') {
    return 'arm64';
  }
  return 'x64';
}

function newestMatch(dir, predicate) {
  if (!existsSync(dir)) {
    return null;
  }
  let best = null;
  let bestMtime = 0;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (!predicate(full, name)) {
      continue;
    }
    const mtime = statSync(full).mtimeMs;
    if (mtime >= bestMtime) {
      best = full;
      bestMtime = mtime;
    }
  }
  return best;
}

export function findReleaseExe(releaseDir, productName) {
  const preferred = path.join(releaseDir, `${productName}.exe`);
  if (existsSync(preferred)) {
    return preferred;
  }
  const fallback = path.join(releaseDir, 'vision-scope-desktop.exe');
  if (existsSync(fallback)) {
    return fallback;
  }
  return newestMatch(releaseDir, (full, name) => name.endsWith('.exe') && statSync(full).isFile());
}

export function findNsisInstaller(releaseDir, productName) {
  const nsisDir = path.join(releaseDir, 'bundle', 'nsis');
  return newestMatch(
    nsisDir,
    (full, name) =>
      name.endsWith('-setup.exe') ||
      (name.endsWith('.exe') && name.toLowerCase().includes(productName.toLowerCase()))
  );
}

export function artifactBasename(version, archTag, profile) {
  return `${readProductName()}_${version}_${archTag}_${profile}`;
}

export function archiveDirFor(releaseDir, profile) {
  return path.join(releaseDir, 'bundle', 'archives', profile);
}

export function copyArtifact(sourcePath, archiveDirectory, destName, profile) {
  mkdirSync(archiveDirectory, { recursive: true });
  const destPath = path.join(archiveDirectory, destName);
  copyFileSync(sourcePath, destPath);
  writeFileSync(path.join(archiveDirectory, `.latest-${profile}.path`), destPath, 'utf8');
  return destPath;
}

export function copyPortableTree(releaseDir, archiveDirectory, folderName) {
  const destRoot = path.join(archiveDirectory, folderName);
  mkdirSync(destRoot, { recursive: true });

  const skip = new Set(['bundle', 'deps', 'build', 'examples', 'incremental']);

  for (const name of readdirSync(releaseDir)) {
    if (skip.has(name)) {
      continue;
    }
    const src = path.join(releaseDir, name);
    const dest = path.join(destRoot, name);
    if (statSync(src).isDirectory()) {
      cpSync(src, dest, { recursive: true });
    } else {
      copyFileSync(src, dest);
    }
  }

  return destRoot;
}

export function runPrebuildSteps() {
  const steps = ['sync-nestcad-loaders.js', 'ensure-vision-scope.js', 'ensure-hdf5-plugin.js'];
  for (const step of steps) {
    const result = spawnSync('node', [path.join(appRoot, 'scripts', step)], {
      cwd: appRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}
