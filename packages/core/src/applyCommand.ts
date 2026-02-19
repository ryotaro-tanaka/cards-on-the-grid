import { applyEvent } from './applyEvent.js';
import type { Command, Event, GameState, ValidationResult } from './types.js';
import { validateIntent } from './validateIntent.js';

function buildEvent(state: GameState, command: Command): Event {
  const { intent } = command;

  if (intent.type === 'EndTurn') {
    const nextOwner = state.activePlayer === state.players[0] ? state.players[1] : state.players[0];
    const nextTurnNo = state.turn + 1;

    return {
      type: 'TurnEnded',
      nextTurn: {
        owner: nextOwner,
        turnNo: nextTurnNo,
      },
    };
  }

  const piece = state.pieces.find((p) => p.id === intent.pieceId);
  if (!piece) {
    throw new Error('buildEvent called with invalid state: piece not found');
  }

  return {
    type: 'PieceMoved',
    pieceId: intent.pieceId,
    from: piece.position,
    to: intent.to,
  };
}

export function applyCommand(
  state: GameState,
  command: Command,
): { state: GameState; events: Event[]; validation: ValidationResult } {
  const validation = validateIntent(state, command);
  if (!validation.ok) {
    return { state, events: [], validation };
  }

  const event = buildEvent(state, command);
  const nextState = applyEvent(state, event);

  return { state: nextState, events: [event], validation };
}
