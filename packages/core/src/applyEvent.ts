import type { Event, GameState } from './types.js';

export function applyEvent(state: GameState, event: Event): GameState {
  if (event.type === 'TurnEnded') {
    return {
      ...state,
      turn: event.nextTurn.turnNo,
      activePlayer: event.nextTurn.owner,
      phase: 'Main',
      turnState: {
        movedPieceIds: [],
      },
    };
  }

  const nextPieces = state.pieces.map((piece) =>
    piece.id === event.pieceId ? { ...piece, position: event.to } : piece,
  );

  return {
    ...state,
    pieces: nextPieces,
  };
}
