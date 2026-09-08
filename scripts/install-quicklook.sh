#!/usr/bin/env bash
set -euo pipefail

# 安装 VisionScope.app 到 /Applications 并注册 Quick Look 扩展
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-macos-env.sh"

APP_BUNDLE="$(_macos_find_archived_app_bundle "${MACOS_PROFILE:-dev}" release)"
if [[ -z "${APP_BUNDLE}" ]]; then
  APP_BUNDLE="$(_macos_find_app_bundle release)"
fi
if [[ -z "${APP_BUNDLE}" ]]; then
  APP_BUNDLE="$(_macos_find_app_bundle debug)"
fi

if [[ -z "${APP_BUNDLE}" ]]; then
  echo "错误: 未找到 VisionScope.app，请先 pnpm tauri build && pnpm embed:quicklook" >&2
  exit 1
fi

APPEX="${APP_BUNDLE}/Contents/PlugIns/VisionScopeQuickLook.appex"
if [[ ! -d "${APPEX}" ]]; then
  echo "错误: 未找到 Quick Look 扩展，请先 pnpm build:quicklook && pnpm embed:quicklook" >&2
  exit 1
fi

echo "==> 安装到 /Applications/VisionScope.app"
echo "    来源: ${APP_BUNDLE}"
killall VisionScope 2>/dev/null || killall vision-scope-desktop 2>/dev/null || true
rm -rf /Applications/VisionScope.app
cp -R "${APP_BUNDLE}" /Applications/VisionScope.app
xattr -cr /Applications/VisionScope.app

INSTALLED_APPEX="/Applications/VisionScope.app/Contents/PlugIns/VisionScopeQuickLook.appex"
if [[ ! -d "${INSTALLED_APPEX}" ]]; then
  echo "错误: 安装后未找到 Quick Look 扩展，请确认已运行 pnpm embed:quicklook" >&2
  exit 1
fi

echo "==> 注册 Quick Look 扩展"
pluginkit -a "${INSTALLED_APPEX}"
open /Applications/VisionScope.app
sleep 2
qlmanage -r
killall Finder 2>/dev/null || true

if ! pluginkit -m -i com.blendviewer.visionscope.quicklook 2>/dev/null | rg -q "visionscope.quicklook"; then
  echo "警告: pluginkit 未识别扩展，请重启 Mac 或再次运行 pnpm install:quicklook" >&2
fi

echo
echo "安装完成。Finder 选中 .glb → 按空格预览。"
echo "首次预览需等待 VisionScope 加载（约 10–30 秒）。"
