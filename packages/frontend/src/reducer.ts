import { applyEvent } from '../../core/src/index.js';
import type { ClientAction, ClientState, DebugMessage, IncomingMessage, OutgoingMessage } from './types.js';

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
    debugMessages: [],
  };
}

function appendDebugMessages(current: ClientState, debugMessage: DebugMessage): DebugMessage[] {
  const next = [...current.debugMessages, debugMessage];
  if (next.length <= MAX_DEBUG_MESSAGES) {
    return next;
  }

  return next.slice(next.length - MAX_DEBUG_MESSAGES);
}

export function reduceIncoming(current: ClientState, message: IncomingMessage): ClientState {
  const debugMessages = appendDebugMessages(current, { direction: 'server', message });

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
      debugMessages,
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
      debugMessages,
    };
  }

  if (message.type === 'REJECT') {
    return {
      ...current,
      lastReject: message.payload,
      debugMessages,
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
    debugMessages,
  };
}

function reduceOutgoing(current: ClientState, message: OutgoingMessage): ClientState {
  return {
    ...current,
    debugMessages: appendDebugMessages(current, { direction: 'client', message }),
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

  if (action.type === 'MESSAGE_SENT') {
    return reduceOutgoing(current, action.payload);
  }

  return reduceIncoming(current, action.payload);
}
