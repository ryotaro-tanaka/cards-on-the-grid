import type { GameState, Intent, Event } from './types';

export function applyIntent(
  state: GameState,
  intent: Intent,
): { state: GameState; events: Event[] } {
  if (intent.type === 'EndTurn') {
    return {
      state: { ...state, turn: state.turn + 1 },
      events: [{ type: 'TurnEnded' }],
    };
  }

  // intent.type === 'Move'
  const { pieceId, to } = intent;
  const piece = state.pieces.find((p) => p.id === pieceId);
  if (!piece) return { state, events: [] };

  const nextPieces = state.pieces.map((p) =>
    p.id === pieceId ? { ...p, position: to } : p,
  );

  return {
    state: { ...state, pieces: nextPieces },
    events: [{ type: 'PieceMoved', pieceId, from: piece.position, to }],
  };
}
