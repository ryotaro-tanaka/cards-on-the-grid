import {
  applyCommand,
  createInitialState,
  type Command,
  type Event,
  type GameState,
  type InvalidReason,
} from '../../core/dist/index.js';

export type RoomState = {
  roomId: string;
  seq: number;
  game: GameState;
};

export type ClientIntentEnvelope = {
  expectedTurn: number;
  command: Command;
};

export type SequencedEvent = {
  seq: number;
  event: Event;
};

export type AcceptedIntent = {
  ok: true;
  room: RoomState;
  events: SequencedEvent[];
};

export type RejectedIntent = {
  ok: false;
  room: RoomState;
  reason: InvalidReason | 'TURN_MISMATCH';
};

export type IntentHandlingResult = AcceptedIntent | RejectedIntent;

export function createRoomState(roomId: string): RoomState {
  return {
    roomId,
    seq: 0,
    game: createInitialState(),
  };
}

export function handleClientIntent(
  room: RoomState,
  envelope: ClientIntentEnvelope,
): IntentHandlingResult {
  if (envelope.expectedTurn !== room.game.turn) {
    return {
      ok: false,
      room,
      reason: 'TURN_MISMATCH',
    };
  }

  const result = applyCommand(room.game, envelope.command);
  if (!result.validation.ok) {
    return {
      ok: false,
      room,
      reason: result.validation.reason,
    };
  }

  const events = result.events.map((event, index) => ({
    seq: room.seq + index + 1,
    event,
  }));

  return {
    ok: true,
    room: {
      ...room,
      seq: room.seq + events.length,
      game: result.state,
    },
    events,
  };
}
