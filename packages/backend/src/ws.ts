import type { Command, Event, GameState, PlayerId } from '../../core/dist/index.js';
import { createRoomState, handleClientIntent, type RejectedIntent, type RoomState } from './room.js';

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

export type ClientMessage = HelloMessage | IntentMessage;

export type WelcomeMessage = {
  type: 'WELCOME';
  payload: {
    roomId: string;
    you: PlayerId;
    seq: number;
    state: GameState;
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
    reason: RejectedIntent['reason'];
    expectedTurn: number;
  };
};

export type ServerMessage = WelcomeMessage | EventMessage | RejectMessage;

export function openRoom(roomId: string): RoomState {
  return createRoomState(roomId);
}

export function createWelcomeMessage(room: RoomState, playerId: PlayerId): WelcomeMessage {
  return {
    type: 'WELCOME',
    payload: {
      roomId: room.roomId,
      you: playerId,
      seq: room.seq,
      state: room.game,
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
      outbound: [
        {
          type: 'REJECT',
          payload: {
            reason: result.reason,
            expectedTurn: room.game.turn,
          },
        },
      ],
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
