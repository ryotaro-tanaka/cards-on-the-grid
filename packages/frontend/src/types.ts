import type { Command, Event, GameState, PlayerId } from '../../core/dist/index.js';

export type RoomStatus = 'waiting' | 'started' | 'finished';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

export type RejectReason =
  | 'TURN_MISMATCH'
  | 'NOT_ACTIVE_PLAYER'
  | 'PIECE_NOT_FOUND'
  | 'PIECE_NOT_OWNED_BY_ACTOR'
  | 'OUT_OF_BOUNDS'
  | 'GAME_ALREADY_FINISHED'
  | 'PHASE_MISMATCH'
  | 'INVALID_MOVE_DISTANCE'
  | 'SAME_POSITION'
  | 'CELL_OCCUPIED'
  | 'MOVE_ALREADY_USED_THIS_TURN'
  | 'ROOM_FULL'
  | 'SEAT_UNASSIGNED'
  | 'INVALID_PLAYER_ID';

export type WelcomePayload = {
  roomId: string;
  you: PlayerId;
  seq: number;
  state: GameState;
  roomStatus: RoomStatus;
};

export type EventPayload = {
  seq: number;
  event: Event;
};

export type SyncPayload = {
  seq: number;
  state: GameState;
  roomStatus: RoomStatus;
};

export type RejectPayload = {
  reason: RejectReason;
  expectedTurn: number;
};

export type IncomingMessage =
  | { type: 'WELCOME'; payload: WelcomePayload }
  | { type: 'EVENT'; payload: EventPayload }
  | { type: 'SYNC'; payload: SyncPayload }
  | { type: 'REJECT'; payload: RejectPayload };

export type HelloMessage = {
  type: 'HELLO';
  payload: {
    playerId?: PlayerId;
  };
};

export type IntentMessage = {
  type: 'INTENT';
  payload: {
    expectedTurn: number;
    command: Command;
  };
};

export type ResyncRequestMessage = {
  type: 'RESYNC_REQUEST';
  payload: {
    fromSeq: number;
  };
};

export type OutgoingMessage = HelloMessage | IntentMessage | ResyncRequestMessage;

export type ClientState = {
  connectionStatus: ConnectionStatus;
  isResyncing: boolean;
  roomId: string | null;
  roomStatus: RoomStatus | null;
  you: PlayerId | null;
  seq: number;
  state: GameState | null;
  lastReject: RejectPayload | null;
};

export type ClientAction =
  | { type: 'CONNECTION_STATUS_CHANGED'; payload: { status: ConnectionStatus } }
  | { type: 'RESYNC_STATUS_CHANGED'; payload: { isResyncing: boolean } }
  | { type: 'MESSAGE_RECEIVED'; payload: IncomingMessage };
