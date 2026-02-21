import {
  connect,
  createDomRenderer,
  createEmptyClientState,
  reduceClientState,
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

const fallbackWs = window.location.origin.replace(/^http/, 'ws');
const baseUrl = __BACKEND_WS_BASE_URL__ || fallbackWs;

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
