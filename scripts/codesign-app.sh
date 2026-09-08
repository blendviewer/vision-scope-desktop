#!/usr/bin/env bash
set -euo pipefail

# 嵌入 Quick Look 后重新签名 .app（由内到外）
# 用法: pnpm codesign:app -- direct

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-${MACOS_PROFILE:-dev}}"
if [[ "${PROFILE}" == "--" ]]; then
  PROFILE="${2:-dev}"
fi
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-macos-env.sh" "${PROFILE}"

APP_BUNDLE="$(_macos_find_app_bundle)"
if [[ -z "${APP_BUNDLE}" || ! -d "${APP_BUNDLE}" ]]; then
  echo "错误: 未找到 VisionScope.app，请先 pnpm tauri build && pnpm embed:quicklook" >&2
  exit 1
fi

APPEX="${APP_BUNDLE}/Contents/PlugIns/VisionScopeQuickLook.appex"
if [[ ! -d "${APPEX}" ]]; then
  echo "错误: 未找到 Quick Look 扩展，请先 pnpm embed:quicklook" >&2
  exit 1
fi

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "错误: 当前 profile「${MACOS_PROFILE}」未配置 APPLE_SIGNING_IDENTITY" >&2
  exit 1
fi

if [[ ! -f "${MACOS_ENTITLEMENTS}" ]]; then
  echo "错误: 未找到 entitlements: ${MACOS_ENTITLEMENTS}" >&2
  exit 1
fi

if [[ ! -f "${MACOS_QL_ENTITLEMENTS}" ]]; then
  echo "错误: 未找到 Quick Look entitlements: ${MACOS_QL_ENTITLEMENTS}" >&2
  exit 1
fi

echo "==> 重新签名 VisionScope.app"
echo "    Profile: ${MACOS_PROFILE}"
echo "    Target: ${MACOS_BUILD_TARGET}"
echo "    Identity: ${APPLE_SIGNING_IDENTITY}"
echo "    App: ${APP_BUNDLE}"

SIGN_OPTS=(--force --options runtime --timestamp --sign "${APPLE_SIGNING_IDENTITY}")

if [[ "${MACOS_PROFILE}" == "appstore" && -n "${MACOS_PROVISIONPROFILE}" ]]; then
  if [[ ! -f "${MACOS_PROVISIONPROFILE}" ]]; then
    echo "错误: 未找到 provisioning profile: ${MACOS_PROVISIONPROFILE}" >&2
    exit 1
  fi
  EMBEDDED_PROFILE="${APP_BUNDLE}/Contents/embedded.provisionprofile"
  cp "${MACOS_PROVISIONPROFILE}" "${EMBEDDED_PROFILE}"
  echo "    Provisioning Profile: ${MACOS_PROVISIONPROFILE}"
fi

# Frameworks / dylibs（先签内层）
if [[ -d "${APP_BUNDLE}/Contents/Frameworks" ]]; then
  while IFS= read -r -d '' item; do
    codesign "${SIGN_OPTS[@]}" "${item}"
  done < <(find "${APP_BUNDLE}/Contents/Frameworks" -depth \( -name '*.dylib' -o -name '*.framework' -o -type f -perm +111 \) -print0 2>/dev/null || true)
fi

# PlugIns 内其他扩展
if [[ -d "${APP_BUNDLE}/Contents/PlugIns" ]]; then
  while IFS= read -r -d '' plugin; do
    [[ "${plugin}" == "${APPEX}" ]] && continue
    codesign "${SIGN_OPTS[@]}" --entitlements "${MACOS_QL_ENTITLEMENTS}" "${plugin}"
  done < <(find "${APP_BUNDLE}/Contents/PlugIns" -maxdepth 1 -mindepth 1 -print0 2>/dev/null || true)
fi

# Quick Look 扩展
codesign "${SIGN_OPTS[@]}" --entitlements "${MACOS_QL_ENTITLEMENTS}" "${APPEX}"

# 主二进制
MAIN_BIN="$(_macos_app_main_binary "${APP_BUNDLE}")"
if [[ -n "${MAIN_BIN}" && -f "${MAIN_BIN}" ]]; then
  codesign "${SIGN_OPTS[@]}" --entitlements "${MACOS_ENTITLEMENTS}" "${MAIN_BIN}"
fi

# App 包
codesign "${SIGN_OPTS[@]}" --entitlements "${MACOS_ENTITLEMENTS}" "${APP_BUNDLE}"

echo "==> 验证签名"
codesign --verify --deep --strict --verbose=2 "${APP_BUNDLE}"
spctl -a -t exec -vv "${APP_BUNDLE}" || true

ARCHIVE_DIR="$(_macos_archive_dir_for_bundle "${APP_BUNDLE}" "${MACOS_PROFILE}")"
mkdir -p "${ARCHIVE_DIR}"
rm -rf "${ARCHIVE_DIR}/VisionScope.app"
ditto "${APP_BUNDLE}" "${ARCHIVE_DIR}/VisionScope.app"
export MACOS_ARCHIVED_APP_BUNDLE="${ARCHIVE_DIR}/VisionScope.app"

echo
echo "签名完成: ${APP_BUNDLE}"
echo "已归档（${MACOS_PROFILE}）: ${MACOS_ARCHIVED_APP_BUNDLE}"
