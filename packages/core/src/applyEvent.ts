import type { Event, GameState } from './types.js';

export function applyEvent(state: GameState, event: Event): GameState {
  if (event.type === 'TurnEnded') {
    const nextPendingSuccessors = state.pendingSuccessors.map((pending) =>
      pending.owner === event.nextTurn.owner
        ? { ...pending, turnsRemaining: Math.max(0, pending.turnsRemaining - 1) }
        : pending,
    );

    return {
      ...state,
      turn: event.nextTurn.turnNo,
      activePlayer: event.nextTurn.owner,
      phase: 'Reinforcement',
      turnState: {
        movedPieceIds: [],
      },
      pendingSuccessors: nextPendingSuccessors,
    };
  }

  if (event.type === 'PieceMoved') {
    const nextPieces = state.pieces.map((piece) =>
      piece.id === event.pieceId ? { ...piece, position: event.to } : piece,
    );
    const movedPieceIds = state.turnState.movedPieceIds.includes(event.pieceId)
      ? state.turnState.movedPieceIds
      : [...state.turnState.movedPieceIds, event.pieceId];

    return {
      ...state,
      turnState: {
        movedPieceIds,
      },
      pieces: nextPieces,
    };
  }

  if (event.type === 'CombatResolved') {
    const attackerMoved = state.turnState.movedPieceIds.includes(event.attackerPieceId)
      ? state.turnState.movedPieceIds
      : [...state.turnState.movedPieceIds, event.attackerPieceId];

    const defender = state.pieces.find((piece) => piece.id === event.defenderPieceId);
    const nextPieces = state.pieces.flatMap((piece) => {
      if (piece.id !== event.defenderPieceId) {
        return [piece];
      }

      if (event.defenderDefeated) {
        return [];
      }

      return [{ ...piece, currentHp: event.defenderHpAfter }];
    });

    const nextPendingSuccessors =
      event.defenderDefeated && defender
        ? [
            ...state.pendingSuccessors,
            {
              id: `${event.defenderPieceId}_respawn_${state.turn}`,
              owner: defender.owner,
              kind: defender.kind,
              stats: defender.stats,
              turnsRemaining: defender.stats.successorCost,
            },
          ]
        : state.pendingSuccessors;

    return {
      ...state,
      turnState: {
        movedPieceIds: attackerMoved,
      },
      pieces: nextPieces,
      pendingSuccessors: nextPendingSuccessors,
    };
  }

  if (event.type === 'SuccessorSpawned') {
    return {
      ...state,
      pieces: [...state.pieces, event.piece],
      pendingSuccessors: state.pendingSuccessors.filter((pending) => pending.id !== event.pendingId),
    };
  }

  return {
    ...state,
    status: 'Finished',
    winner: event.winner,
  };
}
