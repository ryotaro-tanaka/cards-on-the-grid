import { applyEvent, type Event, type GameState, type PlayerId } from '../../core/dist/index.js';

export type WelcomePayload = {
  roomId: string;
  you: PlayerId;
  seq: number;
  state: GameState;
};

export type EventPayload = {
  seq: number;
  event: Event;
};

export type ClientState = {
  roomId: string | null;
  you: PlayerId | null;
  seq: number;
  state: GameState | null;
};

export type IncomingMessage =
  | { type: 'WELCOME'; payload: WelcomePayload }
  | { type: 'EVENT'; payload: EventPayload }
  | { type: 'SYNC'; payload: { seq: number; state: GameState } };

export function createEmptyClientState(): ClientState {
  return {
    roomId: null,
    you: null,
    seq: 0,
    state: null,
  };
}

export function reduceIncoming(
  current: ClientState,
  message: IncomingMessage,
): ClientState {
  if (message.type === 'WELCOME') {
    return {
      roomId: message.payload.roomId,
      you: message.payload.you,
      seq: message.payload.seq,
      state: message.payload.state,
    };
  }

  if (message.type === 'SYNC') {
    if (!current.roomId || !current.you) {
      return current;
    }

    return {
      ...current,
      seq: message.payload.seq,
      state: message.payload.state,
    };
  }

  if (!current.state) {
    return current;
  }

  if (message.payload.seq !== current.seq + 1) {
    return current;
  }

  return {
    ...current,
    seq: message.payload.seq,
    state: applyEvent(current.state, message.payload.event),
  };
}
