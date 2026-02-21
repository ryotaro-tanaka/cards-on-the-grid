import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve('packages/frontend'),
  build: {
    outDir: resolve('.pages-dist'),
    emptyOutDir: true,
  },
  define: {
    __BACKEND_WS_BASE_URL__: JSON.stringify(process.env.BACKEND_WS_BASE_URL ?? ''),
  },
});
