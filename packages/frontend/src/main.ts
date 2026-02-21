import {
  connect,
  createDomRenderer,
  createEmptyClientState,
  reduceClientState,
  resolveWebSocketBaseUrl,
  attachPwaMetadata,
  registerServiceWorker,
} from './index.js';

declare const __BACKEND_WS_BASE_URL__: string;

attachPwaMetadata(document.head);
registerServiceWorker();

const root = document.getElementById('app');
if (!root) {
  throw new Error('App root element was not found.');
}

let connection: ReturnType<typeof connect> | null = null;

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
const wsBaseUrlFromQuery = params.get('wsBaseUrl') ?? undefined;

const baseUrl = resolveWebSocketBaseUrl({
  configuredBaseUrl: __BACKEND_WS_BASE_URL__,
  locationOrigin: window.location.origin,
  locationHostname: window.location.hostname,
  queryBaseUrl: wsBaseUrlFromQuery,
});

if (!baseUrl) {
  root.textContent = 'WebSocket接続先が未設定です。BACKEND_WS_BASE_URL を設定するか、?wsBaseUrl=wss://... を指定してください。';
  throw new Error('WebSocket base URL is not configured. Set BACKEND_WS_BASE_URL or pass ?wsBaseUrl=wss://...');
}

let state = createEmptyClientState();

const dispatch = (action: Parameters<typeof reduceClientState>[1]) => {
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
