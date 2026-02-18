import type { GameState, Intent, Event } from './types';

export function applyIntent(
  state: GameState,
  intent: Intent,
): { state: GameState; events: Event[] } {
  if (intent.type === 'EndTurn') {
    const nextOwner =
      state.activePlayer === state.players[0] ? state.players[1] : state.players[0];
    const nextTurnNo = state.turn + 1;

    return {
      state: { ...state, turn: nextTurnNo, activePlayer: nextOwner },
      events: [{ type: 'TurnEnded', nextTurn: { owner: nextOwner, turnNo: nextTurnNo } }],
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
