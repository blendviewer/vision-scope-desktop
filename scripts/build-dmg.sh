#!/usr/bin/env bash
set -euo pipefail

# 在 embed:quicklook 之后打包 DMG，确保 DMG 内含 Quick Look 扩展。
# 不同架构 DMG 使用独立文件名，互不覆盖。
# 用法: pnpm embed:quicklook && pnpm build:dmg -- direct

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PROFILE="${1:-direct}"
if [[ "${PROFILE}" == "--" ]]; then
  PROFILE="${2:-direct}"
fi

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-macos-env.sh" "${PROFILE}"

APP_BUNDLE="$(_macos_find_app_bundle release)"
if [[ -z "${APP_BUNDLE}" || ! -d "${APP_BUNDLE}" ]]; then
  echo "错误: 未找到 VisionScope.app，请先运行: pnpm tauri build --bundles app" >&2
  exit 1
fi

ARCHIVED="$(_macos_find_archived_app_bundle "${MACOS_PROFILE}" release)"
if [[ -n "${ARCHIVED}" ]]; then
  APP_BUNDLE="${ARCHIVED}"
  echo "    使用 ${MACOS_PROFILE} 归档 .app"
fi

BUNDLE_DIR="$(dirname "${APP_BUNDLE}")"
APPEX="${APP_BUNDLE}/Contents/PlugIns/VisionScopeQuickLook.appex"
DMG_DIR="$(_macos_dmg_dir_for_bundle "${APP_BUNDLE}")"

cd "${APP_DIR}"

if [[ ! -d "${APPEX}" ]]; then
  echo "错误: .app 中未嵌入 Quick Look 扩展，请先运行: pnpm embed:quicklook" >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
ARCH_TAG="$(_macos_app_arch_tag "${APP_BUNDLE}")"
DMG_NAME="$(_macos_artifact_basename "${VERSION}" "${ARCH_TAG}" "${MACOS_PROFILE}").dmg"
DMG_FILE="${DMG_DIR}/${DMG_NAME}"
APP_NAME="$(basename "${APP_BUNDLE}")"

mkdir -p "${DMG_DIR}"

echo "==> 打包 DMG（标准安装界面：App + Applications）"
echo "    Target: ${MACOS_BUILD_TARGET}"
echo "    架构: ${ARCH_TAG}"
echo "    App: ${APP_BUNDLE}"

# 仅覆盖同名 DMG，保留其他架构/版本的 DMG
if [[ -f "${DMG_FILE}" ]]; then
  echo "  替换同名文件: ${DMG_FILE}"
  hdiutil detach "${DMG_FILE}" 2>/dev/null || true
  rm -f "${DMG_FILE}"
fi
shopt -s nullglob
for temp_dmg in "${BUNDLE_DIR}"/rw.*.dmg "${DMG_DIR}"/rw.*.dmg; do
  [[ -e "${temp_dmg}" ]] || continue
  echo "  清理临时文件: ${temp_dmg}"
  hdiutil detach "${temp_dmg}" 2>/dev/null || true
  rm -f "${temp_dmg}"
done
shopt -u nullglob

STAGING="$(mktemp -d "${TMPDIR:-/tmp}/visionscope-dmg.XXXXXX")"
cleanup() {
  rm -rf "${STAGING}"
  if [[ -n "${MOUNT_POINT:-}" && -d "${MOUNT_POINT:-}" ]]; then
    hdiutil detach "${MOUNT_POINT}" -force 2>/dev/null || true
    rmdir "${MOUNT_POINT}" 2>/dev/null || true
  fi
  rm -f "${RW_DMG:-}"
}
trap cleanup EXIT

# 先写入 staging，再挂读写 DMG 设置 Finder 布局（与 Tauri 默认 DMG 一致）
ditto "${APP_BUNDLE}" "${STAGING}/${APP_NAME}"
ln -s /Applications "${STAGING}/Applications"

RW_DMG="${DMG_DIR}/rw.${DMG_NAME}"
MOUNT_POINT="$(mktemp -d "${TMPDIR:-/tmp}/visionscope-dmg-mount.XXXXXX")"

# macOS 15+ 空白镜像用 UDIF；旧系统回退 UDRW（-type UDRW 在新版 hdiutil 已无效）
if ! hdiutil create \
  -size 512m \
  -volname "VisionScope" \
  -fs HFS+ \
  -ov \
  -type UDIF \
  "${RW_DMG}" 2>/dev/null; then
  hdiutil create \
    -size 512m \
    -volname "VisionScope" \
    -fs HFS+ \
    -ov \
    -type UDRW \
    "${RW_DMG}"
fi

hdiutil attach -readwrite -noverify -noautoopen -mountpoint "${MOUNT_POINT}" "${RW_DMG}"

if [[ ! -d "${MOUNT_POINT}" ]]; then
  echo "错误: 无法挂载临时 DMG" >&2
  exit 1
fi

ditto "${STAGING}/${APP_NAME}" "${MOUNT_POINT}/${APP_NAME}"
ln -sf /Applications "${MOUNT_POINT}/Applications"

# Finder 图标布局（失败不阻断打包；自定义 mountpoint 下 symlink 位置偶发 -10006）
/usr/bin/osascript <<EOF || echo "  警告: Finder 布局跳过（不影响 DMG 内容）"
tell application "Finder"
  tell disk "VisionScope"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set bounds of container window to {200, 120, 860, 480}
    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 128
    set position of item "${APP_NAME}" of container window to {180, 170}
    try
      set position of item "Applications" of container window to {480, 170}
    end try
    close
    open
    update without registering applications
    delay 1
  end tell
end tell
EOF

sync
hdiutil detach "${MOUNT_POINT}"
rmdir "${MOUNT_POINT}" 2>/dev/null || true
MOUNT_POINT=""

hdiutil convert "${RW_DMG}" -format UDZO -imagekey zlib-level=9 -o "${DMG_FILE}"
rm -f "${RW_DMG}"
RW_DMG=""

if [[ ! -f "${DMG_FILE}" ]]; then
  echo "错误: DMG 未生成" >&2
  exit 1
fi

export MACOS_DMG_FILE="${DMG_FILE}"
printf '%s\n' "${DMG_FILE}" > "${DMG_DIR}/.latest-${MACOS_PROFILE}.path"

echo
echo "DMG 已生成（含 Quick Look 扩展 + Applications 快捷方式）:"
echo "  ${DMG_FILE}"
echo
echo "同目录其他 profile / 架构 DMG 已保留。"
echo "用户安装: 打开 DMG → 将 VisionScope.app 拖到 Applications"
