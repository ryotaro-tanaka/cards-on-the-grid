import type { Event, GameState, Piece } from './types.js';

function queueSuccessorIfDefeated(state: GameState, defeatedPiece: Piece | undefined): GameState['pendingSuccessors'] {
  if (!defeatedPiece) {
    return state.pendingSuccessors;
  }

  return [
    ...state.pendingSuccessors,
    {
      id: `${defeatedPiece.id}_respawn_${state.turn}`,
      owner: defeatedPiece.owner,
      kind: defeatedPiece.kind,
      stats: defeatedPiece.stats,
      turnsRemaining: defeatedPiece.stats.successorCost,
    },
  ];
}

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

    return {
      ...state,
      turnState: {
        movedPieceIds: attackerMoved,
      },
      pieces: nextPieces,
      pendingSuccessors: event.defenderDefeated
        ? queueSuccessorIfDefeated(state, defender)
        : state.pendingSuccessors,
    };
  }

  if (event.type === 'PieceDamaged') {
    const defeatedPiece = state.pieces.find((piece) => piece.id === event.pieceId);
    return {
      ...state,
      pieces: state.pieces.flatMap((piece) => {
        if (piece.id !== event.pieceId) {
          return [piece];
        }
        if (event.defeated) {
          return [];
        }
        return [{ ...piece, currentHp: event.hpAfter }];
      }),
      pendingSuccessors: event.defeated ? queueSuccessorIfDefeated(state, defeatedPiece) : state.pendingSuccessors,
    };
  }

  if (event.type === 'PieceBuffed') {
    return {
      ...state,
      pieces: state.pieces.map((piece) => {
        if (piece.id !== event.pieceId) {
          return piece;
        }

        const nextStats = {
          ...piece.stats,
          attack: piece.stats.attack + event.attackDelta,
          maxHp: piece.stats.maxHp + event.maxHpDelta,
        };

        return {
          ...piece,
          stats: nextStats,
          currentHp: Math.min(nextStats.maxHp, piece.currentHp + event.currentHpDelta),
        };
      }),
    };
  }

  if (event.type === 'ActiveSkillReset') {
    return {
      ...state,
      pieces: state.pieces.map((piece) =>
        piece.id === event.pieceId ? { ...piece, activeSkillUsed: false } : piece,
      ),
    };
  }

  if (event.type === 'MineTriggered') {
    const triggeredPiece = state.pieces.find((piece) => piece.id === event.triggeredByPieceId);
    const withoutMine = state.mines.filter(
      (mine) =>
        !(mine.owner === event.mineOwner && mine.position.x === event.position.x && mine.position.y === event.position.y),
    );

    return {
      ...state,
      mines: withoutMine,
      pieces: state.pieces.flatMap((piece) => {
        if (piece.id !== event.triggeredByPieceId) {
          return [piece];
        }

        if (event.defeated) {
          return [];
        }

        return [{ ...piece, currentHp: event.hpAfter }];
      }),
      pendingSuccessors: event.defeated ? queueSuccessorIfDefeated(state, triggeredPiece) : state.pendingSuccessors,
    };
  }

  if (event.type === 'SuccessorSpawned') {
    return {
      ...state,
      pieces: [...state.pieces, event.piece],
      pendingSuccessors: state.pendingSuccessors.filter((pending) => pending.id !== event.pendingId),
    };
  }

  if (event.type === 'CardDrawn') {
    return {
      ...state,
      hands: {
        ...state.hands,
        [event.playerId]: [...(state.hands[event.playerId] ?? []), event.card],
      },
    };
  }

  if (event.type === 'CardDiscardedForDrawLimit') {
    return {
      ...state,
      hands: {
        ...state.hands,
        [event.playerId]: (state.hands[event.playerId] ?? []).filter((card) => card.id !== event.discardedCardId),
      },
    };
  }

  if (event.type === 'CardUsed') {
    return {
      ...state,
      hands: {
        ...state.hands,
        [event.playerId]: (state.hands[event.playerId] ?? []).filter((card) => card.id !== event.cardId),
      },
    };
  }

  if (event.type === 'CardStolen') {
    return {
      ...state,
      hands: {
        ...state.hands,
        [event.fromPlayerId]: (state.hands[event.fromPlayerId] ?? []).filter((card) => card.id !== event.card.id),
        [event.toPlayerId]: [...(state.hands[event.toPlayerId] ?? []), event.card],
      },
    };
  }

  if (event.type === 'MinePlaced') {
    return {
      ...state,
      mines: [...state.mines, { owner: event.owner, position: event.position }],
    };
  }

  return {
    ...state,
    status: 'Finished',
    winner: event.winner,
  };
}
