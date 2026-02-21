import {
  applyCommand,
  createInitialState,
  type Command,
  type Event,
  type GameState,
  type InvalidReason,
  type PlayerId,
} from '../../core/dist/index.js';

export type RoomLifecycle = 'waiting' | 'started' | 'finished';

export type RoomState = {
  roomId: string;
  seq: number;
  game: GameState;
  lifecycle: RoomLifecycle;
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

export type RandomSource = () => number;

export function createRoomState(roomId: string): RoomState {
  return {
    roomId,
    seq: 0,
    game: createInitialState(),
    lifecycle: 'waiting',
  };
}

export function resolvePlayerId(room: RoomState, rawPlayerId: string): PlayerId | null {
  return room.game.players.find((playerId) => playerId === rawPlayerId) ?? null;
}

export function markRoomStarted(room: RoomState, random: RandomSource = Math.random): RoomState {
  if (room.lifecycle !== 'waiting') {
    return room;
  }

  const [firstPlayer, secondPlayer] = room.game.players;
  const activePlayer = random() < 0.5 ? firstPlayer : secondPlayer;

  return {
    ...room,
    lifecycle: 'started',
    game: {
      ...room.game,
      activePlayer,
    },
  };
}

export function markRoomFinished(room: RoomState): RoomState {
  if (room.lifecycle === 'finished') {
    return room;
  }

  return {
    ...room,
    lifecycle: 'finished',
  };
}

export function handleClientIntent(
  room: RoomState,
  envelope: ClientIntentEnvelope,
): IntentHandlingResult {
  if (room.lifecycle !== 'started') {
    return {
      ok: false,
      room,
      reason: 'PHASE_MISMATCH',
    };
  }

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

  const nextRoom: RoomState = {
    ...room,
    seq: room.seq + events.length,
    game: result.state,
  };

  return {
    ok: true,
    room: result.state.status === 'Finished' ? markRoomFinished(nextRoom) : nextRoom,
    events,
  };
}
