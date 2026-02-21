import { applyEvent } from '../../core/dist/index.js';
import type { ClientAction, ClientState, IncomingMessage } from './types.js';

export function createEmptyClientState(): ClientState {
  return {
    connectionStatus: 'closed',
    roomId: null,
    roomStatus: null,
    you: null,
    seq: 0,
    state: null,
    lastReject: null,
  };
}

export function reduceIncoming(current: ClientState, message: IncomingMessage): ClientState {
  if (message.type === 'WELCOME') {
    return {
      ...current,
      roomId: message.payload.roomId,
      roomStatus: message.payload.roomStatus,
      you: message.payload.you,
      seq: message.payload.seq,
      state: message.payload.state,
      lastReject: null,
    };
  }

  if (message.type === 'SYNC') {
    if (!current.roomId || !current.you) {
      return current;
    }

    return {
      ...current,
      roomStatus: message.payload.roomStatus,
      seq: message.payload.seq,
      state: message.payload.state,
      lastReject: null,
    };
  }

  if (message.type === 'REJECT') {
    return {
      ...current,
      lastReject: message.payload,
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
    lastReject: null,
  };
}

export function reduceClientState(current: ClientState, action: ClientAction): ClientState {
  if (action.type === 'CONNECTION_STATUS_CHANGED') {
    return {
      ...current,
      connectionStatus: action.payload.status,
    };
  }

  return reduceIncoming(current, action.payload);
}
