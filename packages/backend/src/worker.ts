import {
  confirmSeat,
  createRejectMessage,
  createWelcomeMessage,
  handleAdminMessage,
  handleIntentMessage,
  handleResyncRequestMessage,
  openRoom,
  startRoom,
  type ClientMessage,
  type ServerMessage,
} from './ws.js';
import type { PlayerId } from '../../core/dist/index.js';

declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket };
};

type WorkerResponseInit = ResponseInit & { webSocket?: WebSocket };
type AcceptableWebSocket = WebSocket & { accept(): void };

type Env = {
  ROOMS: {
    idFromName(name: string): unknown;
    get(id: unknown): {
      fetch(request: Request): Promise<Response>;
    };
  };
  API_BEARER_TOKEN?: string;
};

function unauthorized(): Response {
  return new Response('Unauthorized', { status: 401 });
}

function parseBearerToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return null;
  }

  return auth.slice('Bearer '.length);
}

function readRoomId(url: URL): string | null {
  const match = /^\/ws\/rooms\/([^/]+)$/.exec(url.pathname);
  if (!match) {
    return null;
  }

  return decodeURIComponent(match[1]);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const token = env.API_BEARER_TOKEN;
    if (token) {
      const incoming = parseBearerToken(request);
      if (incoming !== token) {
        return unauthorized();
      }
    }

    const url = new URL(request.url);
    const roomId = readRoomId(url);
    if (!roomId) {
      return new Response('Not Found', { status: 404 });
    }

    const id = env.ROOMS.idFromName(roomId);
    const stub = env.ROOMS.get(id);

    return stub.fetch(request);
  },
};

type RoomSocket = {
  socket: WebSocket;
  playerId: PlayerId | null;
};

export class RoomDO {
  private room = openRoom('uninitialized');
  private allSockets = new Set<RoomSocket>();
  private seatedSockets = new Map<PlayerId, RoomSocket>();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const roomId = readRoomId(url);

    if (!roomId) {
      return new Response('Not Found', { status: 404 });
    }

    if (this.room.roomId === 'uninitialized') {
      this.room = openRoom(roomId);
    }

    const upgrade = request.headers.get('Upgrade');
    if (upgrade !== 'websocket') {
      return new Response('Expected websocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0] as AcceptableWebSocket;
    const server = pair[1] as AcceptableWebSocket;

    this.handleConnection(server);

    return new Response(null, { status: 101, webSocket: client } as WorkerResponseInit);
  }

  private handleConnection(socket: AcceptableWebSocket): void {
    socket.accept();

    const entry: RoomSocket = { socket, playerId: null };
    this.allSockets.add(entry);

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      this.onMessage(entry, event.data);
    });

    socket.addEventListener('close', () => {
      this.allSockets.delete(entry);
      if (entry.playerId) {
        const active = this.seatedSockets.get(entry.playerId);
        if (active === entry) {
          this.seatedSockets.delete(entry.playerId);
        }
      }
    });
  }

  private onMessage(entry: RoomSocket, raw: string): void {
    let message: ClientMessage;

    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }

    if (message.type === 'HELLO') {
      this.handleHelloMessage(entry, message.payload.playerId);
      return;
    }

    if (!entry.playerId) {
      this.send(entry.socket, createRejectMessage(this.room, 'SEAT_UNASSIGNED'));
      return;
    }

    if (message.type === 'INTENT') {
      if (message.payload.command.actorPlayerId !== entry.playerId) {
        this.send(entry.socket, createRejectMessage(this.room, 'INVALID_PLAYER_ID'));
        return;
      }

      const result = handleIntentMessage(this.room, message);
      this.room = result.room;
      this.broadcast(result.outbound);
      return;
    }

    if (message.type === 'ADMIN') {
      const result = handleAdminMessage(this.room, message);
      this.room = result.room;
      this.destroyRoom();
      return;
    }

    if (message.type === 'RESYNC_REQUEST') {
      const result = handleResyncRequestMessage(this.room, message);
      this.room = result.room;
      this.send(entry.socket, result.outbound);
    }
  }

  private handleHelloMessage(entry: RoomSocket, requestedPlayerId: string): void {
    const seat = confirmSeat(this.room, requestedPlayerId);
    if (!seat.ok) {
      this.send(entry.socket, createRejectMessage(this.room, seat.reason));
      return;
    }

    if (entry.playerId) {
      if (entry.playerId !== seat.playerId) {
        this.send(entry.socket, createRejectMessage(this.room, 'INVALID_PLAYER_ID'));
        return;
      }

      this.send(entry.socket, createWelcomeMessage(this.room, entry.playerId));
      return;
    }

    const existing = this.seatedSockets.get(seat.playerId);
    if (existing && existing !== entry) {
      existing.socket.close(1000, 'RECONNECTED');
      this.seatedSockets.delete(seat.playerId);
    }

    if (this.seatedSockets.size >= this.room.game.players.length) {
      this.send(entry.socket, createRejectMessage(this.room, 'ROOM_FULL'));
      entry.socket.close(1008, 'ROOM_FULL');
      return;
    }

    entry.playerId = seat.playerId;
    this.seatedSockets.set(seat.playerId, entry);

    if (this.seatedSockets.size === this.room.game.players.length) {
      this.room = startRoom(this.room);
      for (const [playerId, peer] of this.seatedSockets.entries()) {
        this.send(peer.socket, createWelcomeMessage(this.room, playerId));
      }
      return;
    }

    this.send(entry.socket, createWelcomeMessage(this.room, seat.playerId));
  }

  private destroyRoom(): void {
    for (const peer of this.allSockets) {
      peer.socket.close(1000, 'ROOM_DESTROYED');
    }

    this.allSockets.clear();
    this.seatedSockets.clear();
  }

  private send(socket: WebSocket, payload: ServerMessage | ServerMessage[]): void {
    if (Array.isArray(payload)) {
      for (const message of payload) {
        socket.send(JSON.stringify(message));
      }
      return;
    }

    socket.send(JSON.stringify(payload));
  }

  private broadcast(messages: ServerMessage[]): void {
    for (const peer of this.seatedSockets.values()) {
      this.send(peer.socket, messages);
    }
  }
}
