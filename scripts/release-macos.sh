#!/usr/bin/env bash
set -euo pipefail

# 一键 macOS 发布，支持三种 profile：
#   dev       — 开发版（Apple Development，本机安装）
#   direct    — 离线版（Developer ID + 签名 + DMG + 公证）
#   appstore  — App Store 版（Apple Distribution + PKG）
#
# 用法:
#   pnpm release:macos -- dev
#   pnpm release:macos -- direct
#   pnpm release:macos -- appstore

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PROFILE="${1:-dev}"
# pnpm -- 会把参数透传；兼容 pnpm release:macos direct 写法
if [[ "${PROFILE}" == "--" ]]; then
  PROFILE="${2:-dev}"
fi

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-macos-env.sh" "${PROFILE}"

export MACOS_BUILD_TARGET="${MACOS_BUILD_TARGET:-universal-apple-darwin}"

cd "${APP_DIR}"

echo "========================================"
echo " VisionScope macOS 发布"
echo " Profile: ${MACOS_PROFILE}"
echo " Team: ${DEVELOPMENT_TEAM}"
echo " Identity: ${APPLE_SIGNING_IDENTITY:-（未签名）}"
echo "========================================"
echo

echo "==> [1] 构建 Quick Look Extension"
"${SCRIPT_DIR}/build-quicklook.sh" "${MACOS_PROFILE}"
echo

echo "==> [2] 构建 Tauri 主 App（universal：arm64 + x86_64）"
# Tauri 在检测到 APPLE_ID + Developer ID 时会自动公证。
# 我们会在嵌入 Quick Look 后重新签名，因此 build 阶段只签名、不公证。
(
  export APPLE_SIGNING_IDENTITY
  unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
  unset APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH
  pnpm tauri build --bundles app --target universal-apple-darwin
)
echo

echo "==> [3] 嵌入 Quick Look Extension"
"${SCRIPT_DIR}/embed-quicklook.sh"
echo

echo "==> [4] 重新签名 .app"
"${SCRIPT_DIR}/codesign-app.sh" "${MACOS_PROFILE}"
echo

case "${MACOS_PROFILE}" in
  dev)
    echo "==> [5] 安装到 /Applications 并注册"
    "${SCRIPT_DIR}/install-quicklook.sh"
    echo
    echo "========================================"
    echo " 开发版构建完成！"
    echo " - 已安装到 /Applications/VisionScope.app"
    echo " - 归档: src-tauri/target/.../archives/dev/VisionScope.app"
    echo " - Finder 选中 .glb → 按空格预览"
    echo "========================================"
    ;;
  direct)
    echo "==> [5] 打包 DMG"
    "${SCRIPT_DIR}/build-dmg.sh" "${MACOS_PROFILE}"
    echo
    echo "==> [6] 提交公证"
    "${SCRIPT_DIR}/notarize-dmg.sh" "${MACOS_PROFILE}"
    echo
    echo "========================================"
    echo " 离线版构建完成！"
    echo " - DMG: VisionScope_*_*_direct.dmg"
    echo " - 归档: src-tauri/target/.../archives/direct/VisionScope.app"
    echo " - DMG 已签名并公证，可直接分发"
    echo "========================================"
    ;;
  appstore)
    echo "==> [5] 生成 App Store PKG"
    "${SCRIPT_DIR}/build-pkg.sh" "${MACOS_PROFILE}"
    echo
    echo "========================================"
    echo " App Store 版构建完成！"
    echo " - PKG: VisionScope_*_*_appstore.pkg"
    echo " - 归档: src-tauri/target/.../archives/appstore/VisionScope.app"
    echo " - 使用 altool / Transporter 上传 PKG"
    echo "========================================"
    ;;
esac
