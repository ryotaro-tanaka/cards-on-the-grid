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

  if (event.type === 'PieceMoved') {
    const nextPieces = state.pieces.map((piece) =>
      piece.id === event.pieceId ? { ...piece, position: event.to } : piece,
    );

    return {
      ...state,
      pieces: nextPieces,
    };
  }

  if (event.type === 'CombatResolved') {
    const nextPieces = state.pieces.flatMap((piece) => {
      if (piece.id !== event.defenderPieceId) {
        return [piece];
      }

      if (event.defenderDefeated) {
        return [];
      }

      return [{ ...piece, currentHp: event.defenderHpAfter }];
    });

    return {
      ...state,
      pieces: nextPieces,
    };
  }

  if (event.type === 'SuccessorSpawned') {
    return {
      ...state,
      pieces: [...state.pieces, event.piece],
    };
  }

  return {
    ...state,
    status: 'Finished',
    winner: event.winner,
  };
}
