import path from 'node:path';
import { defineConfig } from 'vite';

const repoRoot = process.cwd();
const backendWsBaseUrl = process.env.BACKEND_WS_BASE_URL ?? '';

export default defineConfig({
  root: path.join(repoRoot, 'packages/frontend'),
  publicDir: path.join(repoRoot, 'packages/frontend/public'),
  define: {
    __BACKEND_WS_BASE_URL__: JSON.stringify(backendWsBaseUrl),
  },
  build: {
    outDir: path.join(repoRoot, '.pages-dist'),
    emptyOutDir: true,
  },
});
