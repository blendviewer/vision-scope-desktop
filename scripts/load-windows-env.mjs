/**
 * Load Windows release profile settings from optional `.env`.
 *
 * Profiles:
 *   dev    — release binary only (no NSIS), for local smoke tests
 *   direct — NSIS installer for GitHub Releases / SignPath signing
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const appRoot = path.resolve(__dirname, '..');
const envFile = path.join(appRoot, '.env');

function parseEnvFile(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function loadDotEnv() {
  if (!existsSync(envFile)) {
    return {};
  }
  return parseEnvFile(readFileSync(envFile, 'utf8'));
}

export function resolveWindowsProfile(raw) {
  const value = (raw ?? process.env.WINDOWS_PROFILE ?? 'dev').trim().toLowerCase();
  switch (value) {
    case 'dev':
    case 'development':
      return 'dev';
    case 'direct':
    case 'release':
    case 'offline':
      return 'direct';
    default:
      throw new Error(`未知 Windows profile「${raw}」，可选: dev | direct`);
  }
}

export function loadWindowsEnv(rawProfile) {
  const dotEnv = loadDotEnv();
  const profile = resolveWindowsProfile(rawProfile ?? dotEnv.WINDOWS_PROFILE);

  const config = {
    profile,
    buildTarget: dotEnv.WINDOWS_BUILD_TARGET ?? process.env.WINDOWS_BUILD_TARGET ?? '',
    signCommand: dotEnv.WINDOWS_SIGN_COMMAND ?? process.env.WINDOWS_SIGN_COMMAND ?? '',
    certificateThumbprint:
      dotEnv.WINDOWS_CERTIFICATE_THUMBPRINT ?? process.env.WINDOWS_CERTIFICATE_THUMBPRINT ?? '',
    // Reserved for future SignPath CI integration
    signpathOrganizationId:
      dotEnv.SIGNPATH_ORGANIZATION_ID ?? process.env.SIGNPATH_ORGANIZATION_ID ?? '',
    signpathProjectSlug: dotEnv.SIGNPATH_PROJECT_SLUG ?? process.env.SIGNPATH_PROJECT_SLUG ?? '',
    signpathSigningPolicySlug:
      dotEnv.SIGNPATH_SIGNING_POLICY_SLUG ?? process.env.SIGNPATH_SIGNING_POLICY_SLUG ?? '',
    // Tauri 下载 NSIS/WiX 工具链需 SOCKS 代理（HTTP 代理无效）
    proxyUrl:
      dotEnv.WINDOWS_PROXY ??
      process.env.WINDOWS_PROXY ??
      process.env.ALL_PROXY ??
      process.env.all_proxy ??
      '',
  };

  return config;
}

export function parseReleaseArgs(argv) {
  const args = argv.slice(2);
  let profile = 'dev';
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') {
      profile = args[i + 1] ?? profile;
      break;
    }
    if (!arg.startsWith('-')) {
      profile = arg;
      break;
    }
  }
  return profile;
}
