import {
  createWelcomeMessage,
  handleAdminMessage,
  handleIntentMessage,
  handleResyncRequestMessage,
  openRoom,
  type ClientMessage,
  type ServerMessage,
} from './ws.js';

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
  playerId: string;
};

export class RoomDO {
  private room = openRoom('uninitialized');
  private sockets = new Set<RoomSocket>();

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

    this.handleConnection(server, url);

    return new Response(null, { status: 101, webSocket: client } as WorkerResponseInit);
  }

  private handleConnection(socket: AcceptableWebSocket, url: URL): void {
    socket.accept();

    const playerId = url.searchParams.get('playerId') ?? `p${this.sockets.size + 1}`;
    const entry: RoomSocket = { socket, playerId };
    this.sockets.add(entry);

    const welcome = createWelcomeMessage(this.room, playerId);
    this.send(entry.socket, welcome);

    socket.addEventListener('message', (event: MessageEvent<string>) => {
      this.onMessage(entry, event.data);
    });

    socket.addEventListener('close', () => {
      this.sockets.delete(entry);
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
      const welcome = createWelcomeMessage(this.room, entry.playerId);
      this.send(entry.socket, welcome);
      return;
    }

    if (message.type === 'INTENT') {
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

  private destroyRoom(): void {
    for (const peer of this.sockets) {
      peer.socket.close(1000, 'ROOM_DESTROYED');
    }

    this.sockets.clear();
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
    for (const peer of this.sockets) {
      this.send(peer.socket, messages);
    }
  }
}
