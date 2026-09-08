/**
 * Windows release pipeline for VisionScope Desktop.
 *
 * Profiles:
 *   dev    — release .exe only (--no-bundle), for local smoke tests
 *   direct — NSIS installer for distribution (unsigned; SignPath hook reserved)
 *
 * Usage:
 *   pnpm release:windows
 *   pnpm release:windows -- dev
 *   pnpm release:windows -- direct
 */
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

import { appRoot, loadWindowsEnv, parseReleaseArgs } from './load-windows-env.mjs';
import {
  archiveDirFor,
  artifactBasename,
  copyArtifact,
  copyPortableTree,
  detectArchTag,
  findNsisInstaller,
  findReleaseExe,
  readAppVersion,
  readProductName,
  resolveReleaseDir,
  runPrebuildSteps,
} from './windows-release-utils.mjs';

const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
const pathKey = process.platform === 'win32' ? 'Path' : 'PATH';
const pathSep = process.platform === 'win32' ? ';' : ':';

function withCargoPath(env) {
  const next = { ...env };
  const currentPath = next[pathKey] ?? '';
  if (!currentPath.split(pathSep).some((entry) => entry.toLowerCase() === cargoBin.toLowerCase())) {
    next[pathKey] = `${cargoBin}${pathSep}${currentPath}`;
  }
  return next;
}

/** Tauri bundler 下载 NSIS 仅走 SOCKS；同时设置 HTTP 代理供 pnpm/cargo 使用。 */
function withProxyEnv(env, config) {
  const proxy = config.proxyUrl?.trim();
  if (!proxy) {
    return env;
  }

  const next = { ...env, ALL_PROXY: proxy, all_proxy: proxy };

  if (proxy.startsWith('http://') || proxy.startsWith('https://')) {
    next.HTTP_PROXY = proxy;
    next.HTTPS_PROXY = proxy;
    next.http_proxy = proxy;
    next.https_proxy = proxy;
  }

  return next;
}

function buildEnv(config) {
  return withProxyEnv(withCargoPath({ ...process.env }), config);
}

function runTauriBuild(config, extraArgs) {
  const args = ['exec', 'tauri', 'build', ...extraArgs];
  if (config.buildTarget) {
    args.push('--target', config.buildTarget);
  }

  const result = spawnSync('pnpm', args, {
    cwd: appRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: buildEnv(config),
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function maybeSignInstaller(installerPath, config) {
  if (config.signCommand) {
    console.log('==> [sign] 使用 WINDOWS_SIGN_COMMAND 签名');
    const result = spawnSync(config.signCommand, [installerPath], {
      cwd: appRoot,
      stdio: 'inherit',
      shell: true,
    });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
    return installerPath;
  }

  if (config.signpathOrganizationId) {
    console.log('==> [sign] 检测到 SignPath 环境变量，但 CI 集成尚未配置');
    console.log('     请参考 docs/windows-release.md 中的 SignPath 章节');
  } else {
    console.log('==> [sign] 跳过（未配置 WINDOWS_SIGN_COMMAND / SignPath）');
    console.log('     安装包为未签名版本，SmartScreen 可能提示「未知发布者」');
  }

  return installerPath;
}

function main() {
  if (process.platform !== 'win32') {
    console.error('release:windows 仅支持在 Windows 上运行。');
    console.error('如需 CI 交叉构建，请使用 GitHub Actions windows-latest runner。');
    process.exit(1);
  }

  const profileArg = parseReleaseArgs(process.argv);
  const config = loadWindowsEnv(profileArg);
  const version = readAppVersion();
  const productName = readProductName();

  console.log('========================================');
  console.log(' VisionScope Windows 发布');
  console.log(` Profile: ${config.profile}`);
  console.log(` Version: ${version}`);
  console.log(` Target: ${config.buildTarget || '(host default)'}`);
  if (config.proxyUrl) {
    console.log(` Proxy: ${config.proxyUrl}`);
  } else {
    console.log(' Proxy: (未设置 — NSIS 下载 GitHub 可能超时)');
  }
  console.log('========================================');
  console.log();

  console.log('==> [1] 准备依赖（nestcad loaders + HDF5 plugin）');
  runPrebuildSteps();
  console.log();

  if (config.profile === 'dev') {
    console.log('==> [2] 构建 Tauri release（无安装包，--no-bundle）');
    runTauriBuild(config, ['--no-bundle']);
  } else {
    console.log('==> [2] 构建 Tauri release + NSIS 安装包');
    runTauriBuild(config, ['--bundles', 'nsis']);
  }
  console.log();

  const releaseDir = resolveReleaseDir(config.buildTarget);
  const archTag = detectArchTag(releaseDir, config.buildTarget);
  const archiveDirectory = archiveDirFor(releaseDir, config.profile);
  const baseName = artifactBasename(version, archTag, config.profile);

  console.log('==> [3] 归档产物');
  const archived = [];

  const releaseExe = findReleaseExe(releaseDir, productName);
  if (!releaseExe) {
    console.error(`错误: 未找到 release 可执行文件，目录: ${releaseDir}`);
    process.exit(1);
  }

  if (config.profile === 'dev') {
    const portableDir = copyPortableTree(releaseDir, archiveDirectory, `${baseName}_portable`);
    archived.push(`便携目录: ${portableDir}`);
    archived.push(`可执行文件: ${releaseExe}`);
  } else {
    const nsisInstaller = findNsisInstaller(releaseDir, productName);
    if (!nsisInstaller) {
      console.error(`错误: 未找到 NSIS 安装包，目录: ${path.join(releaseDir, 'bundle', 'nsis')}`);
      process.exit(1);
    }

    const destName = `${baseName}-setup.exe`;
    let archivedInstaller = copyArtifact(nsisInstaller, archiveDirectory, destName, config.profile);
    archivedInstaller = maybeSignInstaller(archivedInstaller, config);
    archived.push(`安装包: ${archivedInstaller}`);
    archived.push(`原始 NSIS: ${nsisInstaller}`);
  }

  console.log();
  console.log('========================================');
  if (config.profile === 'dev') {
    console.log(' 开发版构建完成！');
    console.log(` - ${archived.join('\n - ')}`);
    console.log(' - 可直接运行 release 目录下的 VisionScope.exe 做冒烟测试');
  } else {
    console.log(' 离线版构建完成！');
    console.log(` - ${archived.join('\n - ')}`);
    console.log(' - 可将 *-setup.exe 上传到 GitHub Releases');
    console.log(' - 申请 SignPath 后可在 CI 中对安装包签名（见 docs/windows-release.md）');
  }
  console.log('========================================');
}

main();
