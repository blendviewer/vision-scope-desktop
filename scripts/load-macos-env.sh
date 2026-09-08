#!/usr/bin/env bash
# 从 .env 加载 macOS 签名 profile，导出统一环境变量。
# 用法: source scripts/load-macos-env.sh [dev|direct|appstore]

set -euo pipefail

_macos_env_script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MACOS_APP_DIR="$(cd "${_macos_env_script_dir}/.." && pwd)"
MACOS_ENV_FILE="${MACOS_APP_DIR}/.env"

if [[ -f "${MACOS_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${MACOS_ENV_FILE}"
  set +a
fi

_macos_resolve_profile() {
  local raw="${1:-${MACOS_PROFILE:-dev}}"
  case "${raw}" in
    dev | development) echo "dev" ;;
    direct | offline | dmg) echo "direct" ;;
    appstore | store | distribution) echo "appstore" ;;
    *)
      echo "错误: 未知 profile「${raw}」，可选: dev | direct | appstore" >&2
      return 1
      ;;
  esac
}

_macos_apply_profile() {
  local profile="$1"
  MACOS_PROFILE="${profile}"

  case "${profile}" in
    dev)
      DEVELOPMENT_TEAM="${MACOS_DEV_TEAM:?请在 .env 中设置 MACOS_DEV_TEAM}"
      APPLE_SIGNING_IDENTITY="${MACOS_DEV_SIGNING_IDENTITY:-}"
      CODE_SIGN_IDENTITY="${MACOS_DEV_CODE_SIGN_IDENTITY:-Apple Development}"
      MACOS_ENTITLEMENTS="${MACOS_DEV_ENTITLEMENTS:-src-tauri/Entitlements.direct.plist}"
      MACOS_QL_ENTITLEMENTS="${MACOS_DEV_QL_ENTITLEMENTS:-quicklook/VisionScopeQuickLook/VisionScopeQuickLook.entitlements}"
      MACOS_PROVISIONPROFILE=""
      ;;
    direct)
      DEVELOPMENT_TEAM="${MACOS_DIRECT_TEAM:?请在 .env 中设置 MACOS_DIRECT_TEAM}"
      APPLE_SIGNING_IDENTITY="${MACOS_DIRECT_SIGNING_IDENTITY:?请在 .env 中设置 MACOS_DIRECT_SIGNING_IDENTITY}"
      CODE_SIGN_IDENTITY="${MACOS_DIRECT_CODE_SIGN_IDENTITY:-Developer ID Application}"
      MACOS_ENTITLEMENTS="${MACOS_DIRECT_ENTITLEMENTS:-src-tauri/Entitlements.direct.plist}"
      MACOS_QL_ENTITLEMENTS="${MACOS_DIRECT_QL_ENTITLEMENTS:-quicklook/VisionScopeQuickLook/VisionScopeQuickLook.entitlements}"
      MACOS_PROVISIONPROFILE=""
      APPLE_ID="${MACOS_DIRECT_APPLE_ID:-}"
      APPLE_PASSWORD="${MACOS_DIRECT_APPLE_PASSWORD:-}"
      APPLE_API_ISSUER="${MACOS_DIRECT_APPLE_API_ISSUER:-}"
      APPLE_API_KEY="${MACOS_DIRECT_APPLE_API_KEY:-}"
      APPLE_API_KEY_PATH="${MACOS_DIRECT_APPLE_API_KEY_PATH:-}"
      ;;
    appstore)
      DEVELOPMENT_TEAM="${MACOS_APPSTORE_TEAM:?请在 .env 中设置 MACOS_APPSTORE_TEAM}"
      APPLE_SIGNING_IDENTITY="${MACOS_APPSTORE_SIGNING_IDENTITY:?请在 .env 中设置 MACOS_APPSTORE_SIGNING_IDENTITY}"
      CODE_SIGN_IDENTITY="${MACOS_APPSTORE_CODE_SIGN_IDENTITY:-Apple Distribution}"
      MACOS_ENTITLEMENTS="${MACOS_APPSTORE_ENTITLEMENTS:-src-tauri/Entitlements.appstore.plist}"
      MACOS_QL_ENTITLEMENTS="${MACOS_APPSTORE_QL_ENTITLEMENTS:-quicklook/VisionScopeQuickLook/VisionScopeQuickLook.entitlements}"
      MACOS_PROVISIONPROFILE="${MACOS_APPSTORE_PROVISIONPROFILE:-}"
      APPLE_API_ISSUER="${MACOS_APPSTORE_APPLE_API_ISSUER:-}"
      APPLE_API_KEY="${MACOS_APPSTORE_APPLE_API_KEY:-}"
      APPLE_API_KEY_PATH="${MACOS_APPSTORE_APPLE_API_KEY_PATH:-}"
      ;;
  esac

  APPLE_TEAM_ID="${DEVELOPMENT_TEAM}"

  if [[ "${MACOS_ENTITLEMENTS}" != /* ]]; then
    MACOS_ENTITLEMENTS="${MACOS_APP_DIR}/${MACOS_ENTITLEMENTS}"
  fi
  if [[ "${MACOS_QL_ENTITLEMENTS}" != /* ]]; then
    MACOS_QL_ENTITLEMENTS="${MACOS_APP_DIR}/${MACOS_QL_ENTITLEMENTS}"
  fi
  if [[ -n "${MACOS_PROVISIONPROFILE}" && "${MACOS_PROVISIONPROFILE}" != /* ]]; then
    MACOS_PROVISIONPROFILE="${MACOS_APP_DIR}/${MACOS_PROVISIONPROFILE}"
  fi

  export MACOS_PROFILE DEVELOPMENT_TEAM APPLE_SIGNING_IDENTITY APPLE_TEAM_ID
  export CODE_SIGN_IDENTITY MACOS_ENTITLEMENTS MACOS_QL_ENTITLEMENTS MACOS_PROVISIONPROFILE
  export APPLE_ID APPLE_PASSWORD APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH
}

# Rust/Tauri 构建 target，例如 universal-apple-darwin、aarch64-apple-darwin
# release 流程默认 universal；可通过环境变量覆盖
MACOS_BUILD_TARGET="${MACOS_BUILD_TARGET:-universal-apple-darwin}"

_macos_target_root() {
  local mode="${1:-release}"
  echo "${MACOS_APP_DIR}/src-tauri/target/${MACOS_BUILD_TARGET}/${mode}/bundle"
}

_macos_app_bundle_candidates() {
  local mode="${1:-release}"
  local root="${MACOS_APP_DIR}/src-tauri/target"
  local preferred="${root}/${MACOS_BUILD_TARGET}/${mode}/bundle/macos/VisionScope.app"
  if [[ -d "${preferred}" ]]; then
    echo "${preferred}"
    return
  fi
  # 回退：按修改时间取最新（兼容旧 target/release 路径）
  find "${root}" -path "*/${mode}/bundle/macos/VisionScope.app" -type d 2>/dev/null \
    | while IFS= read -r app; do
        printf '%s\t%s\n' "$(stat -f '%m' "${app}" 2>/dev/null || echo 0)" "${app}"
      done \
    | sort -rn \
    | head -1 \
    | cut -f2-
}

_macos_find_app_bundle() {
  local mode="${1:-release}"
  _macos_app_bundle_candidates "${mode}"
}

_macos_app_main_binary() {
  local app_bundle="$1"
  local macos_dir="${app_bundle}/Contents/MacOS"
  if [[ -f "${macos_dir}/VisionScope" ]]; then
    echo "${macos_dir}/VisionScope"
    return
  fi
  if [[ -f "${macos_dir}/vision-scope-desktop" ]]; then
    echo "${macos_dir}/vision-scope-desktop"
    return
  fi
  find "${macos_dir}" -maxdepth 1 -type f -perm +111 2>/dev/null | head -1
}

_macos_app_arch_tag() {
  local app_bundle="$1"
  local app_bin
  app_bin="$(_macos_app_main_binary "${app_bundle}")"
  local arch=""
  if [[ -n "${app_bin}" && -f "${app_bin}" ]]; then
    if lipo -info "${app_bin}" 2>/dev/null | grep -q 'Non-fat file'; then
      arch="$(lipo -info "${app_bin}" | awk '{print $NF}')"
    else
      arch="universal"
    fi
  else
    arch="$(uname -m)"
  fi
  case "${arch}" in
    arm64) echo "aarch64" ;;
    x86_64) echo "x64" ;;
    universal) echo "universal" ;;
    *) echo "${arch}" ;;
  esac
}

_macos_bundle_root_for_app() {
  local app_bundle="$1"
  dirname "$(dirname "${app_bundle}")"
}

_macos_dmg_dir_for_bundle() {
  local app_bundle="$1"
  local root="$(_macos_bundle_root_for_app "${app_bundle}")"
  # archives/direct/VisionScope.app → 输出到 bundle/dmg（与 Tauri 默认路径一致）
  if [[ "${root}" == */archives ]]; then
    echo "$(dirname "${root}")/dmg"
    return
  fi
  echo "${root}/dmg"
}

_macos_dmg_search_dirs() {
  local profile="${1:-${MACOS_PROFILE:-direct}}"
  local app_bundle archived root
  local -a dirs=()

  app_bundle="$(_macos_find_app_bundle release)"
  if [[ -n "${app_bundle}" ]]; then
    dirs+=("$(_macos_dmg_dir_for_bundle "${app_bundle}")")
    root="$(_macos_bundle_root_for_app "${app_bundle}")"
    if [[ "${root}" == */archives ]]; then
      dirs+=("${root}/dmg")
    fi
  fi

  archived="$(_macos_find_archived_app_bundle "${profile}" release)"
  if [[ -n "${archived}" ]]; then
    dirs+=("$(_macos_dmg_dir_for_bundle "${archived}")")
    root="$(_macos_bundle_root_for_app "${archived}")"
    if [[ "${root}" == */archives ]]; then
      dirs+=("${root}/dmg")
    fi
  fi

  local dir
  for dir in "${dirs[@]}"; do
    [[ -n "${dir}" ]] || continue
    echo "${dir}"
  done | awk '!seen[$0]++'
}

_macos_find_dmg_file() {
  local arch_tag="${1:-}"
  local profile="${2:-${MACOS_PROFILE:-direct}}"
  local dmg_dir pattern latest_file

  if [[ -n "${MACOS_DMG_FILE:-}" && -f "${MACOS_DMG_FILE}" ]]; then
    echo "${MACOS_DMG_FILE}"
    return
  fi

  while IFS= read -r dmg_dir; do
    [[ -n "${dmg_dir}" && -d "${dmg_dir}" ]] || continue

    latest_file="${dmg_dir}/.latest-${profile}.path"
    if [[ -f "${latest_file}" ]]; then
      DMG_CAND="$(tr -d '\n' < "${latest_file}")"
      if [[ -n "${DMG_CAND}" && -f "${DMG_CAND}" ]]; then
        echo "${DMG_CAND}"
        return
      fi
    fi

    if [[ -n "${arch_tag}" ]]; then
      pattern="VisionScope_*_${arch_tag}_${profile}.dmg"
      find "${dmg_dir}" -maxdepth 1 -name "${pattern}" -type f 2>/dev/null | head -1 && return
    fi

    find "${dmg_dir}" -maxdepth 1 -name "VisionScope_*_${profile}.dmg" -type f 2>/dev/null \
      | while IFS= read -r dmg; do
          printf '%s\t%s\n' "$(stat -f '%m' "${dmg}" 2>/dev/null || echo 0)" "${dmg}"
        done \
      | sort -rn \
      | head -1 \
      | cut -f2- && return
  done < <(_macos_dmg_search_dirs "${profile}")

  find "${MACOS_APP_DIR}/src-tauri/target" -path "*/release/bundle/*/VisionScope_*_${profile}.dmg" -type f 2>/dev/null \
    | while IFS= read -r dmg; do
        printf '%s\t%s\n' "$(stat -f '%m' "${dmg}" 2>/dev/null || echo 0)" "${dmg}"
      done \
    | sort -rn \
    | head -1 \
    | cut -f2-
}

_macos_pkg_dir_for_bundle() {
  local app_bundle="$1"
  local root="$(_macos_bundle_root_for_app "${app_bundle}")"
  if [[ "${root}" == */archives ]]; then
    echo "$(dirname "${root}")/pkg"
    return
  fi
  echo "${root}/pkg"
}

_macos_archive_dir_for_bundle() {
  local app_bundle="$1"
  local profile="${2:-${MACOS_PROFILE:-dev}}"
  local root="$(_macos_bundle_root_for_app "${app_bundle}")"
  if [[ "${root}" == */archives ]]; then
    echo "${root}/${profile}"
    return
  fi
  echo "${root}/archives/${profile}"
}

_macos_artifact_basename() {
  local version="$1"
  local arch_tag="$2"
  local profile="${3:-${MACOS_PROFILE:-dev}}"
  echo "VisionScope_${version}_${arch_tag}_${profile}"
}

_macos_find_archived_app_bundle() {
  local profile="${1:-${MACOS_PROFILE:-dev}}"
  local mode="${2:-release}"
  local app_bundle archive_dir archived
  app_bundle="$(_macos_find_app_bundle "${mode}")"
  if [[ -z "${app_bundle}" ]]; then
    return
  fi
  archive_dir="$(_macos_archive_dir_for_bundle "${app_bundle}" "${profile}")"
  archived="${archive_dir}/VisionScope.app"
  if [[ -d "${archived}" ]]; then
    echo "${archived}"
  fi
}

export MACOS_BUILD_TARGET

if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  _macos_profile="$(_macos_resolve_profile "${1:-}")"
  _macos_apply_profile "${_macos_profile}"
fi
