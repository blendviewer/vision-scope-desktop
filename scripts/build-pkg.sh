#!/usr/bin/env bash
set -euo pipefail

# 从 .app 生成 App Store 用 .pkg
# 用法: pnpm build:pkg -- appstore

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROFILE="${1:-appstore}"
if [[ "${PROFILE}" == "--" ]]; then
  PROFILE="${2:-appstore}"
fi
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-macos-env.sh" "${PROFILE}"

if [[ "${MACOS_PROFILE}" != "appstore" ]]; then
  echo "错误: PKG 打包仅适用于 appstore profile，当前: ${MACOS_PROFILE}" >&2
  exit 1
fi

APP_BUNDLE="$(_macos_find_app_bundle)"
if [[ -z "${APP_BUNDLE}" || ! -d "${APP_BUNDLE}" ]]; then
  echo "错误: 未找到 VisionScope.app" >&2
  exit 1
fi

ARCHIVED="$(_macos_find_archived_app_bundle "${MACOS_PROFILE}" release)"
if [[ -n "${ARCHIVED}" ]]; then
  APP_BUNDLE="${ARCHIVED}"
  echo "    使用 ${MACOS_PROFILE} 归档 .app"
fi

VERSION="$(node -p "require('${APP_DIR}/package.json').version")"
ARCH_TAG="$(_macos_app_arch_tag "${APP_BUNDLE}")"
PKG_DIR="$(_macos_pkg_dir_for_bundle "${APP_BUNDLE}")"
PKG_DIR="$(cd "${PKG_DIR}" && pwd)"
PKG_FILE="${PKG_DIR}/$(_macos_artifact_basename "${VERSION}" "${ARCH_TAG}" "${MACOS_PROFILE}").pkg"

mkdir -p "${PKG_DIR}"

if [[ -f "${PKG_FILE}" ]]; then
  echo "  替换同名文件: ${PKG_FILE}"
  rm -f "${PKG_FILE}"
fi

echo "==> 生成 PKG（App Store）"
echo "    架构: ${ARCH_TAG}"
echo "    Identity: ${APPLE_SIGNING_IDENTITY}"
echo "    App: ${APP_BUNDLE}"

xcrun productbuild \
  --sign "${APPLE_SIGNING_IDENTITY}" \
  --component "${APP_BUNDLE}" /Applications \
  "${PKG_FILE}"

echo
echo "PKG 已生成:"
echo "  ${PKG_FILE}"
echo
echo "上传 App Store:"
echo "  xcrun altool --upload-app --type macos --file \"${PKG_FILE}\" \\"
echo "    --apiKey YOUR_KEY_ID --apiIssuer YOUR_ISSUER_ID"
