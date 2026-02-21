import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const outputDir = path.join(repoRoot, '.pages-dist');
const publicDir = path.join(repoRoot, 'packages/frontend/public');
const frontendDistDir = path.join(repoRoot, 'packages/frontend/dist');
const coreDistDir = path.join(repoRoot, 'packages/core/dist');

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await cp(frontendDistDir, path.join(outputDir, 'packages/frontend/dist'), { recursive: true });
await cp(coreDistDir, path.join(outputDir, 'packages/core/dist'), { recursive: true });
await cp(publicDir, outputDir, { recursive: true });

const backendWsBaseUrl = process.env.BACKEND_WS_BASE_URL ?? '';
const appConfig = `window.__APP_CONFIG__ = { backendWsBaseUrl: ${JSON.stringify(backendWsBaseUrl)} };\n`;
await writeFile(path.join(outputDir, 'app-config.js'), appConfig, 'utf8');

const indexHtml = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Cards on the Grid</title>
    <script src="./app-config.js"></script>
    <script type="module">
      import {
        connect,
        createDomRenderer,
        createEmptyClientState,
        reduceClientState,
        attachPwaMetadata,
        registerServiceWorker,
      } from './packages/frontend/dist/index.js';

      attachPwaMetadata(document.head);
      registerServiceWorker();

      const root = document.getElementById('app');
      const renderer = createDomRenderer(root, {
        onSendIntent(command, expectedTurn) {
          connection?.sendIntent(command, expectedTurn);
        },
        onReconnect() {
          connection?.reconnect();
        },
      });

      const params = new URLSearchParams(window.location.search);
      const roomId = params.get('roomId') ?? 'room-1';
      const playerId = params.get('playerId') === 'p2' ? 'p2' : 'p1';
      const name = params.get('name') ?? undefined;

      const wsBaseUrl = window.__APP_CONFIG__?.backendWsBaseUrl;
      const fallbackWs = window.location.origin.replace(/^http/, 'ws');
      const baseUrl = wsBaseUrl || fallbackWs;

      let state = createEmptyClientState();
      let connection = null;

      const dispatch = (action) => {
        state = reduceClientState(state, action);
        renderer.render(state);
      };

      renderer.render(state);

      connection = connect({
        baseUrl,
        roomId,
        playerId,
        name,
        onConnectionStatusChange(status) {
          dispatch({ type: 'CONNECTION_STATUS_CHANGED', payload: { status } });
        },
        onResyncStatusChange(isResyncing) {
          dispatch({ type: 'RESYNC_STATUS_CHANGED', payload: { isResyncing } });
        },
        onMessage(message) {
          dispatch({ type: 'MESSAGE_RECEIVED', payload: message });
        },
      });
    </script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`;

await writeFile(path.join(outputDir, 'index.html'), indexHtml, 'utf8');

const manifestPath = path.join(outputDir, 'manifest.webmanifest');
const manifestRaw = await readFile(manifestPath, 'utf8');
const manifest = JSON.parse(manifestRaw);
if (!Array.isArray(manifest.icons)) {
  manifest.icons = [];
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`pages build output: ${path.relative(repoRoot, outputDir)}`);
