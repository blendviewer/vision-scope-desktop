#!/usr/bin/env bash
set -euo pipefail

# 将 monorepo 内的 vision-scope-desktop 同步到独立开源仓库。
# monorepo 源目录保持 workspace:* 不变；copy 完成后自动改目标仓库为 npm 依赖。
# 用法: ./scripts/sync-to-oss.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEST_DIR="/Volumes/openrc-ssd/Projects/vision-scope-desktop"
MONOREPO_ROOT="$(cd "${SOURCE_DIR}/../.." && pwd)"
VISION_SCOPE_PKG="${MONOREPO_ROOT}/packages/vision-scope/package.json"
VISION_SCOPE_NPM="@blendviewer/vision-scope"
VISION_SCOPE_DIST="node_modules/@blendviewer/vision-scope/dist"

if [[ ! -d "${DEST_DIR}" ]]; then
  echo "错误: 目标目录不存在: ${DEST_DIR}" >&2
  exit 1
fi

# 优先从 npm 读取已发布版本，失败则回退到 monorepo 本地 package.json
if VISION_SCOPE_VERSION="$(npm view "${VISION_SCOPE_NPM}" version 2>/dev/null)"; then
  echo "vision-scope 版本来源: npm (${VISION_SCOPE_NPM}@${VISION_SCOPE_VERSION})"
elif [[ -f "${VISION_SCOPE_PKG}" ]]; then
  VISION_SCOPE_VERSION="$(node -pe "require('${VISION_SCOPE_PKG}').version")"
  echo "vision-scope 版本来源: monorepo (${VISION_SCOPE_VERSION})"
else
  echo "错误: 无法获取 ${VISION_SCOPE_NPM} 版本" >&2
  exit 1
fi

VISION_SCOPE_RANGE="^${VISION_SCOPE_VERSION}"

echo "源目录:   ${SOURCE_DIR}  (保持 workspace:*，不修改)"
echo "目标目录: ${DEST_DIR}"
echo

rsync -av \
  --exclude 'scripts/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'src-tauri/target/' \
  --exclude 'src-tauri/gen/' \
  --exclude 'quicklook/build/' \
  --exclude 'quicklook/VisionScopeQuickLook.xcodeproj/' \
  --exclude 'quicklook/VisionScopeQuickLook/Resources/web/' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  --exclude '.env' \
  --exclude '.env.*' \
  "${SOURCE_DIR}/" "${DEST_DIR}/"

patch_package_json() {
  local file="${DEST_DIR}/package.json"

  # copy 之后：workspace:* → npm 包（等同 pnpm add @blendviewer/vision-scope）
  sed -i '' \
    -e "s|\"${VISION_SCOPE_NPM}\": \"workspace:[^\"]*\"|\"${VISION_SCOPE_NPM}\": \"${VISION_SCOPE_RANGE}\"|" \
    -e 's/"private": true/"private": false/' \
    "${file}"
}

patch_vite_config() {
  local file="${DEST_DIR}/vite.config.js"

  # copy 之后：monorepo 路径 → node_modules 路径
  sed -i '' \
    "s|../../packages/vision-scope/dist|${VISION_SCOPE_DIST}|g" \
    "${file}"
}

echo "copy 完成，正在修改目标仓库..."
patch_package_json
patch_vite_config

if grep -q '"workspace:' "${DEST_DIR}/package.json"; then
  echo "错误: 目标 package.json 仍包含 workspace 依赖，替换失败" >&2
  exit 1
fi

if grep -q '../../packages/vision-scope/dist' "${DEST_DIR}/vite.config.js"; then
  echo "错误: 目标 vite.config.js 仍包含 monorepo 路径，替换失败" >&2
  exit 1
fi

echo
echo "目标仓库已改为 npm 依赖（monorepo 源文件未动）："
grep "${VISION_SCOPE_NPM}" "${DEST_DIR}/package.json"
echo
echo "请到 ${DEST_DIR} 手动执行："
echo "  pnpm install"
echo "  git status && git add . && git commit && git push"
