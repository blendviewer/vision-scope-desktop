# VisionScope Desktop

[English](./README.en.md)

<p align="center">
  <img src="./assets/preview.png" alt="VisionScope Desktop preview" width="720" />
</p>

**免费 · 开源 · 一个 App 看所有文件**

VisionScope 是一款跨平台桌面文件查看器。拖入或双击文件即可打开——图片、文档、表格、3D 模型、CAD、点云……不用装一堆软件，一个应用搞定。

> 基于 [Tauri](https://tauri.app) 构建，轻量、快速、本地运行。

---

## 你能用它做什么

- 双击或拖拽打开文件
- 自动识别文件类型，无需手动选择
- 本地查看，文件不上传
- 完全免费，代码开源

---

## 支持的文件类型

### 图片
`jpg` `jpeg` `png` `webp` `gif` `bmp` `tif` `tiff` `svg`

### 3D 模型
`glb` `gltf` `fbx` `obj` `stl` `3ds` `3dm` `3mf` `dae` `ifc` `usdz` 等

### CAD / 工程
`dwg` `dxf` `step` `stp` `iges` `igs` `brep`

### 点云
`pcd` `ply` `las` `laz`

### 纹理
`ktx2` `basis`

### 文档
`pdf` `doc` `pptx` `ppt` `txt` `md`

### 表格
`csv` `tsv` `xlsx` `xls` `ods`

### 音视频
`mp4` `webm` `avi` `mov` `mkv` `mp3` `wav` `flac` `aac` `ogg`

### 代码 / 文本
`js` `ts` `py` `java` `go` `rs` `c` `cpp` `html` `css` `json` `yaml` `xml` `sql` `sh` 等

### 压缩包
`zip` `rar` `7z` `tar` `gz`（支持预览包内文件）

---

## 开发

```bash
pnpm install
pnpm tauri dev
```

打包：

```bash
pnpm tauri build
```

---

## 开源协议

MIT License — 自由使用、修改和分发。
