import { defineConfig } from 'vite';

// Renderer hem tarayıcı önizlemesinde hem Electron penceresinde aynı kaynaktan çalışır.
// Electron paketlenmiş halde dist/index.html'i yüklediği için base './' olmalı.
export default defineConfig({
  root: 'renderer',
  base: './',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
});
