import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));
const visionScopeDist = path.resolve(root, 'node_modules/@blendviewer/vision-scope/dist');
const hdf5PluginDist = path.resolve(root, 'node_modules/@blendviewer/vision-hdf5-plugin/dist');
const isProduction = process.env.NODE_ENV === 'production';

/** vite-plugin-static-copy globs break when paths contain backslashes (Windows). */
function copySrc(...parts) {
  return path.join(...parts).replace(/\\/g, '/');
}

// vision-scope SDK 的 dist 产物是自包含 bundle（index.js），
// 但运行时会按相对路径加载 wasm / envmaps 等静态资源，
// 因此需要把这些资源复制到前端构建产物中，保证相对路径正确。
export default defineConfig({
  base: './',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'es2021',
    minify: isProduction,
    sourcemap: !isProduction,
    modulePreload: false,
    rollupOptions: {
      input: {
        main: path.resolve(root, 'index.html'),
        quicklook: path.resolve(root, 'quicklook.html'),
        preview: path.resolve(root, 'preview.html'),
      },
      output: {
        manualChunks(id) {
          if (id.includes('@blendviewer/vision-scope') || id.includes('/packages/vision-scope/')) {
            return 'vision-scope';
          }
          // HDF5 插件是独立自包含 bundle（内联 React 18），单独成 chunk，
          // 避免与主 app 的 React 19 混入同一 chunk。
          if (
            id.includes('@blendviewer/vision-hdf5-plugin') ||
            id.includes('/packages/vision-hdf5-plugin/')
          ) {
            return 'vision-hdf5-plugin';
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: copySrc(visionScopeDist, 'nestcad-envmaps', '**', '*'),
          dest: 'nestcad-envmaps',
        },
        {
          src: copySrc(visionScopeDist, 'nestcad-loaders', 'loaders', '**', '*'),
          dest: 'nestcad-loaders/loaders',
        },
        {
          src: copySrc(visionScopeDist, 'styles', '**', '*'),
          dest: 'styles',
        },
        {
          src: copySrc(visionScopeDist, 'ui-styles', '**', '*'),
          dest: 'ui-styles',
        },
        {
          src: copySrc(visionScopeDist, 'duckdb-eh.wasm'),
          dest: 'assets',
        },
        {
          src: copySrc(visionScopeDist, 'duckdb-browser-eh.worker.js'),
          dest: 'assets',
        },
        {
          src: copySrc(visionScopeDist, 'duckdb-tabular.js'),
          dest: 'assets',
        },
        {
          src: copySrc(visionScopeDist, 'duckdb-tabular.css'),
          dest: 'assets',
        },
        {
          src: copySrc(visionScopeDist, 'sql-wasm.wasm'),
          dest: 'assets',
        },
        {
          // HDF5 插件 CSS：插件 bundle 里 `attachHubBundledCss` 运行时相对
          // `import.meta.url` 解析 `./vision-hdf5-plugin.css`，需与插件 chunk
          // 同目录（Vite 产物统一放 assets/）。文件名必须保持原名（无 hash），
          // 因为插件 bundle 硬编码了这个相对路径。
          src: copySrc(hdf5PluginDist, 'vision-hdf5-plugin.css'),
          dest: 'assets',
        },
      ],
    }),
  ],
});
