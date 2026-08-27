import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath, URL } from 'node:url';

// vision-scope SDK 的 dist 产物是自包含 bundle（index.js），
// 但运行时会按相对路径加载 wasm / envmaps 等静态资源，
// 因此需要把这些资源复制到前端构建产物中，保证相对路径正确。
export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'es2021',
    minify: false,
    sourcemap: true,
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
          src: 'node_modules/@blendviewer/vision-scope/dist/nestcad-envmaps/**/*',
          dest: 'nestcad-envmaps',
        },
        {
          src: 'node_modules/@blendviewer/vision-scope/dist/nestcad-loaders/**/*',
          dest: 'nestcad-loaders',
        },
        {
          src: 'node_modules/@blendviewer/vision-scope/dist/styles/**/*',
          dest: 'styles',
        },
        {
          src: 'node_modules/@blendviewer/vision-scope/dist/ui-styles/**/*',
          dest: 'ui-styles',
        },
      ],
    }),
  ],
});
