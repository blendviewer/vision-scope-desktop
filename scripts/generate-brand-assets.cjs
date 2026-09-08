#!/usr/bin/env node
/**
 * 从 fustar 的 linglong-logo.svg 生成 VisionScope Desktop 品牌资源与 Tauri 图标。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const appDir = path.join(__dirname, '..');
const svgPath = path.join(appDir, '../fustar/public/linglong-logo.svg');
const publicSvg = path.join(appDir, 'public/linglong-logo.svg');
const iconSource = path.join(appDir, 'app-icon.png');

async function main() {
  if (!fs.existsSync(svgPath)) {
    console.error('Missing logo source:', svgPath);
    process.exit(1);
  }

  const sharp = require('sharp');
  const svgBuffer = fs.readFileSync(svgPath);

  fs.mkdirSync(path.dirname(publicSvg), { recursive: true });
  fs.copyFileSync(svgPath, publicSvg);

  await sharp(svgBuffer, { density: 384 })
    .resize(1024, 1024)
    .png()
    .toFile(iconSource);

  execFileSync('pnpm', ['tauri', 'icon', iconSource], {
    cwd: appDir,
    stdio: 'inherit',
  });

  console.log('Brand assets updated: public/linglong-logo.svg + src-tauri/icons/*');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
