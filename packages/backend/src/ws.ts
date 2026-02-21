import type { Command, Event, GameState, PlayerId } from '../../core/dist/index.js';
import {
  createRoomState,
  handleClientIntent,
  markRoomStarted,
  resolvePlayerId,
  type RejectedIntent,
  type RoomState,
} from './room.js';

export type HelloMessage = {
  type: 'HELLO';
  payload: {
    playerId: PlayerId;
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

export type AdminMessage = {
  type: 'ADMIN';
  payload: {
    action: 'DESTROY_ROOM';
  };
};

export type ClientMessage = HelloMessage | IntentMessage | ResyncRequestMessage | AdminMessage;

export type WelcomeMessage = {
  type: 'WELCOME';
  payload: {
    roomId: string;
    you: PlayerId;
    seq: number;
    state: GameState;
    roomStatus: RoomState['lifecycle'];
  };
};

export type EventMessage = {
  type: 'EVENT';
  payload: {
    seq: number;
    event: Event;
  };
};

export type RejectMessage = {
  type: 'REJECT';
  payload: {
    reason: RejectReason;
    expectedTurn: number;
  };
};

export type SyncMessage = {
  type: 'SYNC';
  payload: {
    seq: number;
    state: GameState;
    roomStatus: RoomState['lifecycle'];
  };
};

export type ServerMessage = WelcomeMessage | EventMessage | RejectMessage | SyncMessage;

export type RejectReason = RejectedIntent['reason'] | 'ROOM_FULL' | 'SEAT_UNASSIGNED' | 'INVALID_PLAYER_ID';

export function confirmSeat(
  room: RoomState,
  requestedPlayerId: string,
): { ok: true; playerId: PlayerId } | { ok: false; reason: 'INVALID_PLAYER_ID' } {
  const playerId = resolvePlayerId(room, requestedPlayerId);
  if (!playerId) {
    return { ok: false, reason: 'INVALID_PLAYER_ID' };
  }

  return { ok: true, playerId };
}

export function openRoom(roomId: string): RoomState {
  return createRoomState(roomId);
}

export function startRoom(room: RoomState, random: () => number = Math.random): RoomState {
  return markRoomStarted(room, random);
}

export function createWelcomeMessage(room: RoomState, playerId: PlayerId): WelcomeMessage {
  return {
    type: 'WELCOME',
    payload: {
      roomId: room.roomId,
      you: playerId,
      seq: room.seq,
      state: room.game,
      roomStatus: room.lifecycle,
    },
  };
}

export function createRejectMessage(room: RoomState, reason: RejectReason): RejectMessage {
  return {
    type: 'REJECT',
    payload: {
      reason,
      expectedTurn: room.game.turn,
    },
  };
}

export function handleIntentMessage(
  room: RoomState,
  message: IntentMessage,
): { room: RoomState; outbound: ServerMessage[] } {
  const result = handleClientIntent(room, {
    expectedTurn: message.payload.expectedTurn,
    command: message.payload.command,
  });

  if (!result.ok) {
    return {
      room,
      outbound: [createRejectMessage(room, result.reason)],
    };
  }

  return {
    room: result.room,
    outbound: result.events.map((item) => ({
      type: 'EVENT',
      payload: {
        seq: item.seq,
        event: item.event,
      },
    })),
  };
}

export function handleResyncRequestMessage(
  room: RoomState,
  message: ResyncRequestMessage,
): { room: RoomState; outbound: ServerMessage[] } {
  if (message.payload.fromSeq === room.seq) {
    return { room, outbound: [] };
  }

  return {
    room,
    outbound: [
      {
        type: 'SYNC',
        payload: {
          seq: room.seq,
          state: room.game,
          roomStatus: room.lifecycle,
        },
      },
    ],
  };
}

export function handleAdminMessage(
  room: RoomState,
  _message: AdminMessage,
): { room: RoomState; outbound: ServerMessage[] } {
  return {
    room: createRoomState('uninitialized'),
    outbound: [],
  };
}
