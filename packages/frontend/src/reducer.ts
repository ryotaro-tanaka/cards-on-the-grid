import { applyEvent } from '../../core/dist/index.js';
import type { ClientAction, ClientState, IncomingMessage } from './types.js';

const MAX_DEBUG_MESSAGES = 30;

export function createEmptyClientState(): ClientState {
  return {
    connectionStatus: 'closed',
    isResyncing: false,
    roomId: null,
    roomStatus: null,
    you: null,
    seq: 0,
    state: null,
    lastReject: null,
    debugIncomingMessages: [],
  };
}

function appendDebugIncomingMessages(current: ClientState, message: IncomingMessage): string[] {
  const next = [...current.debugIncomingMessages, JSON.stringify(message)];
  if (next.length <= MAX_DEBUG_MESSAGES) {
    return next;
  }

  return next.slice(next.length - MAX_DEBUG_MESSAGES);
}

export function reduceIncoming(current: ClientState, message: IncomingMessage): ClientState {
  const debugIncomingMessages = appendDebugIncomingMessages(current, message);

  if (message.type === 'WELCOME') {
    return {
      ...current,
      isResyncing: false,
      roomId: message.payload.roomId,
      roomStatus: message.payload.roomStatus,
      you: message.payload.you,
      seq: message.payload.seq,
      state: message.payload.state,
      lastReject: null,
      debugIncomingMessages,
    };
  }

  if (message.type === 'SYNC') {
    if (!current.roomId || !current.you) {
      return current;
    }

    return {
      ...current,
      isResyncing: false,
      roomStatus: message.payload.roomStatus,
      seq: message.payload.seq,
      state: message.payload.state,
      lastReject: null,
      debugIncomingMessages,
    };
  }

  if (message.type === 'REJECT') {
    return {
      ...current,
      lastReject: message.payload,
      debugIncomingMessages,
    };
  }

  if (!current.state) {
    return current;
  }

  if (message.payload.seq !== current.seq + 1) {
    return current;
  }

  const nextState = applyEvent(current.state, message.payload.event);

  return {
    ...current,
    isResyncing: false,
    seq: message.payload.seq,
    roomStatus: nextState.status === 'Finished' ? 'finished' : current.roomStatus,
    state: nextState,
    lastReject: null,
    debugIncomingMessages,
  };
}

export function reduceClientState(current: ClientState, action: ClientAction): ClientState {
  if (action.type === 'CONNECTION_STATUS_CHANGED') {
    return {
      ...current,
      connectionStatus: action.payload.status,
    };
  }

  if (action.type === 'RESYNC_STATUS_CHANGED') {
    return {
      ...current,
      isResyncing: action.payload.isResyncing,
    };
  }

  return reduceIncoming(current, action.payload);
}
