# macOS Quick Look Extension (PoC)

Finder 中选中文件按空格，由系统调用此扩展预览。

**定位：只补 macOS Quick Look 不原生支持的格式**，不重复 jpg / pdf / mp4 等系统已做好的类型。

## 架构：Finder 并集 vs App 内格式

| 配置 | 文件 | 作用 |
|------|------|------|
| **Finder 最大并集**（UTI 准入） | `config/quickLookUnion.js` | macOS 可能路由到 .appex 的扩展名/UTI 槽位 |
| **当前启用的 Finder 预览** | `config/platformFormats.js` | 哪些并集槽位在发版时已激活 |
| **App 内支持格式** | `@blendviewer/vision-scope/formats` + 插件 | 与 Finder 并集无关 |

插件安装 / 发版时将能力**映射到并集已有槽位**；扩大并集需改 `quickLookUnion.js` 并重新 build .appex。

运行时路由表：`public/preview-registry.json`（generate 产出，随 web 资源打包）。

## 支持格式

### 已激活 Finder 预览（platformFormats）
3D/CAD/点云/代码/Markdown/TXT 等，见 `PLATFORM_BY_EXT` 与 `code` category。

### 并集内预留（需插件或未启用）
如 `docx`、`h5`、`kicad_*` 等 — 系统会调起扩展，registry 提示安装插件。

## 前置依赖

- **完整 Xcode**（仅 Command Line Tools 不够）
- xcodegen：`brew install xcodegen`

## 构建与安装

```bash
export DEVELOPMENT_TEAM=YOUR_TEAM_ID
pnpm release:macos
```

或分步：

```bash
pnpm build:quicklook
pnpm tauri build
pnpm embed:quicklook
pnpm install:quicklook
```

## 测试

1. Finder 选中 `.glb` / `.obj` 等文件
2. 按空格（首次加载 VisionScope 约需 10–30 秒）

## 新增 Finder 格式

1. **新槽位**：在 `config/quickLookUnion.js` 增加 UTI（或依赖 BUILTIN 自动生成）
2. **激活预览**：在 `config/platformFormats.js` 设 `quickLook.enabled: true`
3. 运行 `pnpm generate:quicklook`（或 `pnpm build:quicklook`）
4. 重新 build / embed Quick Look 扩展

语义格式（category / mime）仍在 `@blendviewer/vision-scope` 的 `BUILTIN_FORMATS` 维护。
