import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: resolve('packages/frontend'),
  build: {
    outDir: resolve('.pages-dist'),
    emptyOutDir: true,
  },
});
