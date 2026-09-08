#!/usr/bin/env bash
set -euo pipefail

# 将 VisionScopeQuickLook.appex 嵌入 Tauri 打包后的 .app
# 用法: MACOS_BUILD_TARGET=universal-apple-darwin pnpm embed:quicklook

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
QL_BUILD="${APP_DIR}/quicklook/build"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-macos-env.sh"

APPEX="$(find "${QL_BUILD}" -name 'VisionScopeQuickLook.appex' -type d 2>/dev/null | head -1)"
if [[ -z "${APPEX}" ]]; then
  echo "未找到 .appex，先运行: ./scripts/build-quicklook.sh" >&2
  exit 1
fi

APP_BUNDLE="$(_macos_find_app_bundle release)"
if [[ -z "${APP_BUNDLE}" ]]; then
  APP_BUNDLE="$(_macos_find_app_bundle debug)"
fi

if [[ -z "${APP_BUNDLE}" ]]; then
  echo "错误: 未找到 VisionScope.app，请先 pnpm tauri build" >&2
  echo "提示: 设置 MACOS_BUILD_TARGET=universal-apple-darwin（release 脚本默认已设置）" >&2
  exit 1
fi

PLUGINS_DIR="${APP_BUNDLE}/Contents/PlugIns"
mkdir -p "${PLUGINS_DIR}"
rm -rf "${PLUGINS_DIR}/VisionScopeQuickLook.appex"
cp -R "${APPEX}" "${PLUGINS_DIR}/"

echo "已嵌入 Quick Look Extension:"
echo "  Target: ${MACOS_BUILD_TARGET}"
echo "  ${PLUGINS_DIR}/VisionScopeQuickLook.appex"
echo
echo "安装到系统并注册（首次或更新后执行一次）:"
echo "  rm -rf /Applications/VisionScope.app"
echo "  cp -R \"${APP_BUNDLE}\" /Applications/VisionScope.app"
echo "  xattr -cr /Applications/VisionScope.app"
echo "  open /Applications/VisionScope.app"
echo "  pluginkit -a /Applications/VisionScope.app/Contents/PlugIns/VisionScopeQuickLook.appex"
echo "  qlmanage -r && killall Finder"
echo
echo "测试: Finder 选中 .glb 文件 → 按空格"
