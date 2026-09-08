# VisionScope Desktop — Windows 发布

## 命令

在 **Windows** 上于 `apps/vision-scope-desktop` 目录执行：

| 命令 | 说明 |
|---|---|
| `pnpm release:windows` | 开发版（默认 `dev`）：只打 release 可执行文件，不生成 NSIS |
| `pnpm release:windows:dev` | 同上 |
| `pnpm release:windows:direct` | 离线版：生成 NSIS 安装包（未签名，可上传 GitHub Releases） |

产物归档目录：

```text
src-tauri/target/release/bundle/archives/{dev|direct}/
```

- **dev**：`*_portable/` 目录 + 原始 `VisionScope.exe`
- **direct**：`VisionScope_{version}_{arch}_direct-setup.exe`

## 前置条件

1. [Tauri Windows 前置依赖](https://v2.tauri.app/start/prerequisites/)（Visual Studio Build Tools、WebView2 等）
2. Rust toolchain（`rustup`）
3. 仓库依赖已安装：`pnpm install`（在 monorepo 根目录）
4. `@blendviewer/vision-scope` 与 `@blendviewer/vision-hdf5-plugin` 的 `dist/` 已构建（`predev` / release 脚本会自动处理 HDF5）

可选：复制 `.env.windows.example` 为 `.env` 并填写签名相关变量。

## 与 macOS 发布对比

| macOS | Windows |
|---|---|
| `pnpm release:macos:dev` | `pnpm release:windows:dev` |
| `pnpm release:macos:direct` | `pnpm release:windows:direct` |
| Quick Look `.appex` | Space Preview 已内置，无需额外扩展 |
| DMG + 公证 | NSIS `-setup.exe`（SignPath / 自购证书签名） |

---

## SignPath 接入指南（后续）

当前 `release:windows:direct` 产出**未签名**安装包。开源项目可申请 [SignPath Foundation](https://signpath.org/) 免费签名。

### 1. 申请资格

- 项目使用 **OSI 认可协议**（如 MIT）
- **公开 GitHub 仓库**，Release 可免费下载
- 有稳定的 CI 构建流程

申请通过后，发布页需注明：

> Free code signing provided by SignPath.io, certificate by SignPath Foundation

### 2. SignPath 控制台配置

1. 创建 **Project**，Repository URL 填你的 GitHub 仓库
2. 关联 **Trusted Build System**：GitHub Actions
3. 添加 **Artifact configuration**（NSIS `.exe`，Authenticode 签名）
4. 创建 **signing policy**（如 `release-signing`），开启 origin verification，限制 `main` / `release/*` 分支
5. 创建 API Token（Submitter 权限），存入 GitHub Secrets：`SIGNPATH_API_TOKEN`
6. 组织 ID 存入 GitHub Variables：`SIGNPATH_ORGANIZATION_ID`

参考官方 Demo：[signpath/github-actions-demo](https://github.com/SignPath/github-actions-demo)

### 3. GitHub Actions 典型流程

```yaml
# 伪代码结构 — 待 SignPath 审批后落地
jobs:
  release-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm --filter vision-scope-desktop release:windows:direct
      - uses: signpath/github-action-submit-signing-request@v1
        with:
          api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
          organization-id: ${{ vars.SIGNPATH_ORGANIZATION_ID }}
          project-slug: vision-scope-desktop
          signing-policy-slug: release-signing
          artifact-configuration-slug: default
          input-artifact-path: apps/vision-scope-desktop/src-tauri/target/release/bundle/archives/direct/VisionScope_*_direct-setup.exe
          wait-for-completion: true
      - uses: softprops/action-gh-release@v2
        with:
          files: <signed-setup.exe>
```

本地 `.env` 可预留（见 `.env.windows.example`）：

- `SIGNPATH_ORGANIZATION_ID`
- `SIGNPATH_PROJECT_SLUG`
- `SIGNPATH_SIGNING_POLICY_SLUG`

**注意**：SignPath 私钥在 HSM 中，**不能**像 macOS 那样本地 `signtool` 随意签；必须通过 CI 提交构建产物。

### 4. 其他签名方式（非 SignPath）

若已有 OV 证书或 Azure Artifact Signing，可在 `.env` 设置：

```env
WINDOWS_SIGN_COMMAND=signtool sign /fd sha256 /tr http://timestamp.digicert.com /td sha256 /a
```

`release:windows:direct` 归档后会调用该命令对 `*-setup.exe` 签名。

---

## 故障排除

| 问题 | 处理 |
|---|---|
| `BUILD_LIB` 不是内部命令 | HDF5 插件构建需 Windows 环境变量；`ensure-hdf5-plugin.js` 已处理 |
| `NODE_ENV=production` 失败 | 已改用 `scripts/run-vite-build.mjs` |
| NSIS 未生成 | 确认在 Windows 上运行，且使用 `release:windows:direct` |
| SmartScreen 警告 | 未签名安装包正常现象；SignPath 或购买证书后可改善 |
