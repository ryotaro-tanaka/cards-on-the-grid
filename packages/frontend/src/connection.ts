import type { Command, PlayerId } from '../../core/dist/index.js';
import type {
  ConnectionStatus,
  EventPayload,
  IncomingMessage,
  OutgoingMessage,
  RejectReason,
  RoomStatus,
} from './types.js';

export type FrontendModuleBoundary = {
  connection: 'WebSocketの接続管理・送受信';
  state: '受信メッセージをClientStateへ還元';
  render: 'ClientStateをUI表示へ変換';
};

type ReadyStateCarrier = {
  readyState: number;
};

type WebSocketEventCarrier = {
  data: unknown;
};

export type WebSocketLike = ReadyStateCarrier & {
  onopen: ((event?: unknown) => void) | null;
  onclose: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  onmessage: ((event: WebSocketEventCarrier) => void) | null;
  send: (data: string) => void;
  close: () => void;
};

export type ConnectOptions = {
  baseUrl: string;
  roomId: string;
  playerId: PlayerId;
  name?: string;
  onConnectionStatusChange?: (status: ConnectionStatus) => void;
  onResyncStatusChange?: (isResyncing: boolean) => void;
  onMessage?: (message: IncomingMessage) => void;
  onInvalidMessage?: (raw: string) => void;
  webSocketFactory?: (url: string) => WebSocketLike;
};

export type FrontendConnection = {
  sendIntent: (command: Command, expectedTurn: number) => void;
  requestResync: (fromSeq: number) => void;
  reconnect: () => void;
  close: () => void;
};

export type ResolveWebSocketBaseUrlOptions = {
  configuredBaseUrl: string;
  locationOrigin: string;
  locationHostname: string;
  queryBaseUrl?: string;
};

export function toConnectionStatus(socket: ReadyStateCarrier): ConnectionStatus {
  if (socket.readyState === WebSocket.OPEN) {
    return 'open';
  }

  if (socket.readyState === WebSocket.CONNECTING) {
    return 'connecting';
  }

  return 'closed';
}

export function createRoomWebSocketUrl(baseUrl: string, roomId: string, name?: string): string {
  const normalized = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const encodedRoomId = encodeURIComponent(roomId);
  const params = new URLSearchParams();

  if (name) {
    params.set('name', name);
  }

  const query = params.toString();
  return `${normalized}/ws/rooms/${encodedRoomId}${query ? `?${query}` : ''}`;
}

export function resolveWebSocketBaseUrl(options: ResolveWebSocketBaseUrlOptions): string {
  if (options.queryBaseUrl) {
    return options.queryBaseUrl;
  }

  if (options.configuredBaseUrl) {
    return options.configuredBaseUrl;
  }
  return options.locationOrigin.replace(/^http/, 'ws');
}

export function connect(options: ConnectOptions): FrontendConnection {
  const wsUrl = createRoomWebSocketUrl(options.baseUrl, options.roomId, options.name);
  const createSocket: (url: string) => WebSocketLike = options.webSocketFactory
    ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);

  let socket: WebSocketLike = createSocket(wsUrl);
  let currentSeq = 0;
  let hasKnownState = false;
  let resyncing = false;

  const setResyncing = (next: boolean) => {
    if (resyncing === next) {
      return;
    }

    resyncing = next;
    options.onResyncStatusChange?.(next);
  };

  const bindSocketHandlers = () => {
    options.onConnectionStatusChange?.(toConnectionStatus(socket));

    socket.onopen = () => {
      options.onConnectionStatusChange?.('open');
      send({
        type: 'HELLO',
        payload: {
          playerId: options.playerId,
        },
      });
    };

    socket.onclose = () => {
      options.onConnectionStatusChange?.('closed');
    };

    socket.onerror = () => {
      options.onConnectionStatusChange?.('closed');
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        options.onInvalidMessage?.('[non-string frame]');
        return;
      }

      const parsed = safeParse(event.data);
      if (!isIncomingMessage(parsed)) {
        options.onInvalidMessage?.(event.data);
        return;
      }

      if (parsed.type === 'WELCOME' || parsed.type === 'SYNC') {
        hasKnownState = true;
        currentSeq = parsed.payload.seq;
        setResyncing(false);
        options.onMessage?.(parsed);
        return;
      }

      if (parsed.type === 'EVENT') {
        const expectedSeq = currentSeq + 1;
        if (!hasKnownState || parsed.payload.seq !== expectedSeq) {
          requestResync(currentSeq);
          return;
        }

        currentSeq = parsed.payload.seq;
        setResyncing(false);
        options.onMessage?.(parsed);
        return;
      }

      options.onMessage?.(parsed);
    };
  };

  const send = (message: OutgoingMessage) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(message));
  };

  const requestResync = (fromSeq: number) => {
    setResyncing(true);
    send({
      type: 'RESYNC_REQUEST',
      payload: { fromSeq },
    });
  };

  bindSocketHandlers();

  return {
    sendIntent(command: Command, expectedTurn: number) {
      send({
        type: 'INTENT',
        payload: {
          expectedTurn,
          command,
        },
      });
    },
    requestResync,
    reconnect() {
      socket.close();
      socket = createSocket(wsUrl);
      bindSocketHandlers();
    },
    close() {
      socket.close();
    },
  };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isIncomingMessage(value: unknown): value is IncomingMessage {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.payload)) {
    return false;
  }

  if (value.type === 'WELCOME') {
    return isWelcomePayload(value.payload);
  }

  if (value.type === 'SYNC') {
    return isSyncPayload(value.payload);
  }

  if (value.type === 'EVENT') {
    return isEventPayload(value.payload);
  }

  if (value.type === 'REJECT') {
    return isRejectPayload(value.payload);
  }

  return false;
}

function isWelcomePayload(payload: Record<string, unknown>): boolean {
  return (
    typeof payload.roomId === 'string'
    && isPlayerId(payload.you)
    && typeof payload.seq === 'number'
    && isRecord(payload.state)
    && isRoomStatus(payload.roomStatus)
  );
}

function isSyncPayload(payload: Record<string, unknown>): boolean {
  return (
    typeof payload.seq === 'number'
    && isRecord(payload.state)
    && isRoomStatus(payload.roomStatus)
  );
}

function isEventPayload(payload: Record<string, unknown>): payload is EventPayload {
  return typeof payload.seq === 'number' && isRecord(payload.event) && typeof payload.event.type === 'string';
}

function isRejectPayload(payload: Record<string, unknown>): boolean {
  return typeof payload.expectedTurn === 'number' && isRejectReason(payload.reason);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 'p1' || value === 'p2';
}

function isRoomStatus(value: unknown): value is RoomStatus {
  return value === 'waiting' || value === 'started' || value === 'finished';
}

function isRejectReason(value: unknown): value is RejectReason {
  return (
    value === 'TURN_MISMATCH'
    || value === 'NOT_ACTIVE_PLAYER'
    || value === 'PIECE_NOT_FOUND'
    || value === 'PIECE_NOT_OWNED_BY_ACTOR'
    || value === 'OUT_OF_BOUNDS'
    || value === 'GAME_ALREADY_FINISHED'
    || value === 'PHASE_MISMATCH'
    || value === 'INVALID_MOVE_DISTANCE'
    || value === 'SAME_POSITION'
    || value === 'CELL_OCCUPIED'
    || value === 'MOVE_ALREADY_USED_THIS_TURN'
    || value === 'ROOM_FULL'
    || value === 'SEAT_UNASSIGNED'
    || value === 'INVALID_PLAYER_ID'
  );
}
