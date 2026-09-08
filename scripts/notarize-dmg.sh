#!/usr/bin/env bash
set -euo pipefail

# 公证 DMG（仅 direct profile）
# 用法:
#   pnpm notarize:dmg -- direct
#   STAPLE_ONLY=1 pnpm notarize:dmg -- direct   # 仅 staple（公证已完成时）

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE="${1:-direct}"
if [[ "${PROFILE}" == "--" ]]; then
  PROFILE="${2:-direct}"
fi
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-macos-env.sh" "${PROFILE}"

if [[ "${MACOS_PROFILE}" != "direct" ]]; then
  echo "错误: 公证仅适用于 direct profile，当前: ${MACOS_PROFILE}" >&2
  exit 1
fi

APP_BUNDLE="$(_macos_find_app_bundle release)"
ARCH_TAG=""
if [[ -n "${APP_BUNDLE}" ]]; then
  ARCH_TAG="$(_macos_app_arch_tag "${APP_BUNDLE}")"
fi

DMG_FILE="$(_macos_find_dmg_file "${ARCH_TAG}")"
if [[ -z "${DMG_FILE}" || ! -f "${DMG_FILE}" ]]; then
  echo "错误: 未找到 DMG，请先 pnpm build:dmg" >&2
  exit 1
fi

DMG_FILE="$(cd "$(dirname "${DMG_FILE}")" && pwd)/$(basename "${DMG_FILE}")"

_macos_run_notarytool() {
  if [[ -n "${APPLE_API_KEY:-}" && -n "${APPLE_API_ISSUER:-}" && -n "${APPLE_API_KEY_PATH:-}" ]]; then
    xcrun notarytool submit "${DMG_FILE}" --wait \
      --key "${APPLE_API_KEY_PATH}" \
      --key-id "${APPLE_API_KEY}" \
      --issuer "${APPLE_API_ISSUER}"
    return
  fi

  if [[ -n "${APPLE_ID:-}" && -n "${APPLE_PASSWORD:-}" ]]; then
    xcrun notarytool submit "${DMG_FILE}" --wait \
      --apple-id "${APPLE_ID}" \
      --team-id "${APPLE_TEAM_ID}" \
      --password "${APPLE_PASSWORD}"
    return
  fi

  echo "错误: 请在 .env 中配置 MACOS_DIRECT_APPLE_PASSWORD 或 App Store Connect API Key" >&2
  exit 1
}

_macos_staple_dmg() {
  echo "==> Staple 公证票据: ${DMG_FILE}"
  xcrun stapler staple "${DMG_FILE}"
  spctl -a -t open -vv "${DMG_FILE}" || true
}

if xcrun stapler validate "${DMG_FILE}" >/dev/null 2>&1; then
  echo "DMG 已完成 staple，跳过: ${DMG_FILE}"
  exit 0
fi

if [[ "${STAPLE_ONLY:-0}" == "1" ]]; then
  _macos_staple_dmg
  echo
  echo "Staple 完成: ${DMG_FILE}"
  exit 0
fi

echo "==> 提交公证: ${DMG_FILE}"
_macos_run_notarytool

_macos_staple_dmg

echo
echo "公证完成: ${DMG_FILE}"
