import {
  ALL_CREATURE_KINDS,
  applyCommand,
  createInitialState,
  type Command,
  type CreatureKind,
  type Event,
  type GameState,
  type InvalidReason,
  type PlayerId,
} from '../../core/src/index.js';

const EVENT_LOG_LIMIT = 64;

export type RoomLifecycle = 'waiting' | 'started' | 'finished';

export type ClientIntentEnvelope = {
  expectedTurn: number;
  command: Command;
};

export type SequencedEvent = {
  seq: number;
  event: Event;
};

export type RoomState = {
  roomId: string;
  seq: number;
  game: GameState;
  lifecycle: RoomLifecycle;
  eventLog: SequencedEvent[];
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

export type ResyncPlan =
  | { mode: 'none' }
  | { mode: 'events'; events: SequencedEvent[] }
  | { mode: 'snapshot' };

export function createRoomState(roomId: string): RoomState {
  return {
    roomId,
    seq: 0,
    game: createInitialState(),
    lifecycle: 'waiting',
    eventLog: [],
  };
}

function pickUniqueInitialCreatures(random: RandomSource): [CreatureKind, CreatureKind, CreatureKind] {
  const pool = [...ALL_CREATURE_KINDS];
  const picked: CreatureKind[] = [];

  for (let i = 0; i < 3; i += 1) {
    const index = Math.floor(random() * pool.length);
    const [kind] = pool.splice(index, 1);
    picked.push(kind);
  }

  return [picked[0], picked[1], picked[2]];
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
  const p1Creatures = pickUniqueInitialCreatures(random);
  const p2Creatures = pickUniqueInitialCreatures(random);

  return {
    ...room,
    lifecycle: 'started',
    game: {
      ...createInitialState({
        players: room.game.players,
        creaturesByPlayer: {
          p1: p1Creatures,
          p2: p2Creatures,
        },
      }),
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

function appendEventLog(currentLog: SequencedEvent[], events: SequencedEvent[]): SequencedEvent[] {
  const merged = [...currentLog, ...events];
  if (merged.length <= EVENT_LOG_LIMIT) {
    return merged;
  }

  return merged.slice(merged.length - EVENT_LOG_LIMIT);
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
    eventLog: appendEventLog(room.eventLog, events),
  };

  return {
    ok: true,
    room: result.state.status === 'Finished' ? markRoomFinished(nextRoom) : nextRoom,
    events,
  };
}


export function planResync(room: RoomState, fromSeq: number): ResyncPlan {
  if (fromSeq === room.seq) {
    return { mode: 'none' };
  }

  if (fromSeq > room.seq) {
    return { mode: 'snapshot' };
  }

  const oldestBufferedSeq = room.eventLog[0]?.seq ?? room.seq + 1;
  const canReplayFromHistory = fromSeq >= oldestBufferedSeq - 1;
  if (!canReplayFromHistory) {
    return { mode: 'snapshot' };
  }

  return {
    mode: 'events',
    events: room.eventLog.filter((item) => item.seq > fromSeq),
  };
}
