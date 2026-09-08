#!/usr/bin/env bash
set -euo pipefail

# 构建 Quick Look Extension（macOS PoC）
# 用法: pnpm build:quicklook -- [dev|direct|appstore]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MONOREPO_ROOT="$(cd "${APP_DIR}/../.." && pwd)"
QL_DIR="${APP_DIR}/quicklook"
RES_DIR="${QL_DIR}/VisionScopeQuickLook/Resources/web"
BUILD_DIR="${QL_DIR}/build"

PROFILE="${1:-${MACOS_PROFILE:-dev}}"
if [[ "${PROFILE}" == "--" ]]; then
  PROFILE="${2:-dev}"
fi

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/load-macos-env.sh" "${PROFILE}"

cd "${APP_DIR}"

echo "==> Quick Look profile: ${MACOS_PROFILE} (Team: ${DEVELOPMENT_TEAM})"

echo "==> 构建 @blendviewer/vision-scope（刷新 dist/vision-scope.css）"
(cd "${MONOREPO_ROOT}" && pnpm --filter @blendviewer/vision-scope build)

echo "==> 生成 Quick Look 配置（Swift + Info.plist）"
node scripts/generate-quicklook-config.js

echo "==> 构建 Quick Look 前端"
pnpm build

echo "==> 拷贝 Quick Look 专用 web 资源（精简，不含 main/preview/source map）"
node scripts/copy-quicklook-web-resources.js

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "错误: 需要安装 xcodegen (brew install xcodegen)" >&2
  exit 1
fi

echo "==> 生成 Xcode 工程"
(cd "${QL_DIR}" && xcodegen generate)

if [[ -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "错误: 当前 profile「${MACOS_PROFILE}」未配置签名身份（.env 中的 MACOS_*_SIGNING_IDENTITY）" >&2
  exit 1
fi

if ! security find-identity -v -p codesigning | grep -Fq "${APPLE_SIGNING_IDENTITY}"; then
  echo "错误: 钥匙串中未找到签名身份: ${APPLE_SIGNING_IDENTITY}" >&2
  echo "可用身份:" >&2
  security find-identity -v -p codesigning >&2 || true
  exit 1
fi

# 使用 Manual 签名，直接读钥匙串证书，不依赖 Xcode Accounts 登录
XCODE_ARGS=(
  -project VisionScopeQuickLook.xcodeproj
  -scheme VisionScopeQuickLook
  -configuration Release
  -derivedDataPath "${BUILD_DIR}/DerivedData"
  "SYMROOT=${BUILD_DIR}/Products"
  CODE_SIGN_STYLE=Manual
  "CODE_SIGN_IDENTITY=${APPLE_SIGNING_IDENTITY}"
  "DEVELOPMENT_TEAM=${DEVELOPMENT_TEAM}"
  PROVISIONING_PROFILE_SPECIFIER=
  ARCHS="arm64 x86_64"
  ONLY_ACTIVE_ARCH=NO
)

echo "==> 编译 Quick Look Extension（Manual Sign: ${APPLE_SIGNING_IDENTITY}）"
rm -rf "${BUILD_DIR}"
(
  cd "${QL_DIR}"
  xcodebuild "${XCODE_ARGS[@]}" build
)

APPEX="$(find "${BUILD_DIR}" -name 'VisionScopeQuickLook.appex' -type d | head -1)"
if [[ -z "${APPEX}" ]]; then
  echo "错误: 未找到 VisionScopeQuickLook.appex" >&2
  exit 1
fi

echo
echo "Quick Look Extension 构建完成:"
echo "  ${APPEX}"
echo
echo "嵌入主 App: pnpm embed:quicklook"
