import type { CardKind, Command, Coord, Piece } from '../../core/src/index.js';
import type { ClientState, IntentMessage } from './types.js';

export const BOARD_SIZE = 7;

export type CellViewModel = {
  x: number;
  y: number;
  piece: {
    id: string;
    owner: string;
    kind: Piece['kind'];
    currentHp: number;
    maxHp: number;
    attack: number;
    successorCost: number;
  } | null;
  isSelected: boolean;
  isOwnPiece: boolean;
  isMovable: boolean;
  isMinePlaceable: boolean;
};

export type BoardViewModel = {
  size: number;
  cells: CellViewModel[];
};

export type CardViewModel = {
  cardId: string;
  kind: CardKind;
  canUse: boolean;
  disabledReason: string | null;
};

export type UseCardIntentResult =
  | { ok: true; message: IntentMessage; nextSelectedPieceId: string | null; clearSelectedCard: boolean }
  | { ok: false; reason: 'CARD_NOT_SELECTED' | 'NOT_YOUR_TURN' | 'SEAT_UNASSIGNED' | 'STATE_UNAVAILABLE' | 'TARGET_REQUIRED' | 'CARD_NOT_FOUND' };

export type MoveIntentResult =
  | { ok: true; message: IntentMessage; nextSelectedPieceId: null }
  | { ok: false; reason: 'NO_SELECTED_PIECE' | 'NOT_YOUR_TURN' | 'SEAT_UNASSIGNED' | 'STATE_UNAVAILABLE' | 'PIECE_NOT_FOUND' };

export type EndTurnIntentResult =
  | { ok: true; message: IntentMessage }
  | { ok: false; reason: 'NOT_YOUR_TURN' | 'SEAT_UNASSIGNED' | 'STATE_UNAVAILABLE' };

export function canAct(state: ClientState): boolean {
  if (!state.state || !state.you) {
    return false;
  }

  return state.roomStatus === 'started' && state.state.status !== 'Finished' && state.state.activePlayer === state.you;
}

function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isOwnTerritory(y: number, you: string): boolean {
  return you === 'p1' ? y === 1 || y === 2 : y === 4 || y === 5;
}

function canUseCardLocally(state: ClientState, cardId: string): { canUse: boolean; reason: string | null } {
  if (!state.state || !state.you) {
    return { canUse: false, reason: 'state not ready' };
  }

  if (!canAct(state)) {
    return { canUse: false, reason: 'not your turn' };
  }

  const card = (state.state.hands[state.you] ?? []).find((item) => item.id === cardId);
  if (!card) {
    return { canUse: false, reason: 'card missing' };
  }

  if (card.kind === 'Stealing') {
    const opponent = state.state.players.find((player) => player !== state.you);
    if (!opponent || (state.state.hands[opponent] ?? []).length === 0) {
      return { canUse: false, reason: 'opponent hand empty' };
    }
  }

  return { canUse: true, reason: null };
}

export function buildHandViewModel(state: ClientState): CardViewModel[] {
  if (!state.state || !state.you) {
    return [];
  }

  return (state.state.hands[state.you] ?? []).map((card) => {
    const local = canUseCardLocally(state, card.id);
    return {
      cardId: card.id,
      kind: card.kind,
      canUse: local.canUse,
      disabledReason: local.reason,
    };
  });
}

function buildMovableCellSet(state: ClientState, selectedPieceId: string | null): Set<string> {
  if (!state.state || !state.you || !selectedPieceId) {
    return new Set();
  }

  if (!canAct(state) || state.state.turnState.movedPieceIds.length > 0) {
    return new Set();
  }

  const piece = state.state.pieces.find((item) => item.id === selectedPieceId && item.owner === state.you);
  if (!piece) {
    return new Set();
  }

  const result = new Set<string>();
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }

      const toX = piece.position.x + dx;
      const toY = piece.position.y + dy;
      if (toX < 0 || toX >= BOARD_SIZE || toY < 0 || toY >= BOARD_SIZE) {
        continue;
      }

      const occupied = state.state.pieces.some((other) => other.position.x === toX && other.position.y === toY);
      if (!occupied) {
        result.add(coordKey(toX, toY));
      }
    }
  }

  return result;
}

function buildMinePlaceableCellSet(state: ClientState, selectedCardId: string | null): Set<string> {
  if (!state.state || !state.you || !selectedCardId || !canAct(state)) {
    return new Set();
  }

  const card = (state.state.hands[state.you] ?? []).find((item) => item.id === selectedCardId);
  if (!card || card.kind !== 'Mine') {
    return new Set();
  }

  const set = new Set<string>();
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (isOwnTerritory(y, state.you)) {
        set.add(coordKey(x, y));
      }
    }
  }

  return set;
}

export function buildBoardViewModel(
  state: ClientState,
  selectedPieceId: string | null,
  selectedCardId: string | null,
): BoardViewModel {
  const cells: CellViewModel[] = [];
  const movableCellSet = buildMovableCellSet(state, selectedPieceId);
  const minePlaceableSet = buildMinePlaceableCellSet(state, selectedCardId);

  for (let displayY = 0; displayY < BOARD_SIZE; displayY += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const y = toGameY(displayY, state.you);
      const piece = state.state?.pieces.find((item) => item.position.x === x && item.position.y === y) ?? null;

      cells.push({
        x,
        y,
        piece: piece
          ? {
            id: piece.id,
            owner: piece.owner,
            kind: piece.kind,
            currentHp: piece.currentHp,
            maxHp: piece.stats.maxHp,
            attack: piece.stats.attack,
            successorCost: piece.stats.successorCost,
          }
          : null,
        isSelected: piece?.id === selectedPieceId,
        isOwnPiece: Boolean(piece && state.you && piece.owner === state.you),
        isMovable: movableCellSet.has(coordKey(x, y)),
        isMinePlaceable: minePlaceableSet.has(coordKey(x, y)),
      });
    }
  }

  return {
    size: BOARD_SIZE,
    cells,
  };
}

function toGameY(displayY: number, you: ClientState['you']): number {
  if (you === 'p1') {
    return BOARD_SIZE - 1 - displayY;
  }

  return displayY;
}

export function selectPiece(state: ClientState, selectedPieceId: string | null, pieceId: string): string | null {
  if (!canAct(state) || !state.you || !state.state) {
    return null;
  }

  const piece = state.state.pieces.find((item) => item.id === pieceId);
  if (!piece || piece.owner !== state.you) {
    return null;
  }

  if (selectedPieceId === pieceId) {
    return null;
  }

  return pieceId;
}

export function createUseCardIntent(
  state: ClientState,
  selectedCardId: string | null,
  selectedPieceId: string | null,
  clickedCell: Coord,
): UseCardIntentResult {
  if (!state.state) {
    return { ok: false, reason: 'STATE_UNAVAILABLE' };
  }

  if (!state.you) {
    return { ok: false, reason: 'SEAT_UNASSIGNED' };
  }

  if (!canAct(state)) {
    return { ok: false, reason: 'NOT_YOUR_TURN' };
  }

  if (!selectedCardId) {
    return { ok: false, reason: 'CARD_NOT_SELECTED' };
  }

  const card = (state.state.hands[state.you] ?? []).find((item) => item.id === selectedCardId);
  if (!card) {
    return { ok: false, reason: 'CARD_NOT_FOUND' };
  }

  const clickedPiece = state.state.pieces.find(
    (piece) => piece.position.x === clickedCell.x && piece.position.y === clickedCell.y,
  );
  const opponent = state.state.players.find((playerId) => playerId !== state.you);

  const base = {
    type: 'UseCard' as const,
    cardId: card.id,
    cardKind: card.kind,
  };

  if (card.kind === 'Move' || card.kind === 'Assault') {
    if (!selectedPieceId) {
      return { ok: false, reason: 'TARGET_REQUIRED' };
    }

    return {
      ok: true,
      message: {
        type: 'INTENT',
        payload: {
          expectedTurn: state.state.turn,
          command: {
            actorPlayerId: state.you,
            intent: {
              ...base,
              pieceId: selectedPieceId,
              to: clickedCell,
            },
          },
        },
      },
      nextSelectedPieceId: null,
      clearSelectedCard: true,
    };
  }

  if (card.kind === 'Mine') {
    return {
      ok: true,
      message: {
        type: 'INTENT',
        payload: {
          expectedTurn: state.state.turn,
          command: {
            actorPlayerId: state.you,
            intent: {
              ...base,
              to: clickedCell,
            },
          },
        },
      },
      nextSelectedPieceId: selectedPieceId,
      clearSelectedCard: true,
    };
  }

  if (card.kind === 'Stealing') {
    if (!opponent) {
      return { ok: false, reason: 'TARGET_REQUIRED' };
    }

    return {
      ok: true,
      message: {
        type: 'INTENT',
        payload: {
          expectedTurn: state.state.turn,
          command: {
            actorPlayerId: state.you,
            intent: {
              ...base,
              targetPlayerId: opponent,
            },
          },
        },
      },
      nextSelectedPieceId: selectedPieceId,
      clearSelectedCard: true,
    };
  }

  if (card.kind === 'Doping' || card.kind === 'Barrier' || card.kind === 'Breath' || card.kind === 'Recharge') {
    if (!clickedPiece) {
      return { ok: false, reason: 'TARGET_REQUIRED' };
    }

    return {
      ok: true,
      message: {
        type: 'INTENT',
        payload: {
          expectedTurn: state.state.turn,
          command: {
            actorPlayerId: state.you,
            intent: {
              ...base,
              pieceId: clickedPiece.id,
            },
          },
        },
      },
      nextSelectedPieceId: selectedPieceId,
      clearSelectedCard: true,
    };
  }

  if (!clickedPiece) {
    return { ok: false, reason: 'TARGET_REQUIRED' };
  }

  return {
    ok: true,
    message: {
      type: 'INTENT',
      payload: {
        expectedTurn: state.state.turn,
        command: {
          actorPlayerId: state.you,
          intent: {
            ...base,
            targetPieceId: clickedPiece.id,
          },
        },
      },
    },
    nextSelectedPieceId: selectedPieceId,
    clearSelectedCard: true,
  };
}

export function createMoveIntent(
  state: ClientState,
  selectedPieceId: string | null,
  to: Coord,
): MoveIntentResult {
  if (!state.state) {
    return { ok: false, reason: 'STATE_UNAVAILABLE' };
  }

  if (!state.you) {
    return { ok: false, reason: 'SEAT_UNASSIGNED' };
  }

  if (!canAct(state)) {
    return { ok: false, reason: 'NOT_YOUR_TURN' };
  }

  if (!selectedPieceId) {
    return { ok: false, reason: 'NO_SELECTED_PIECE' };
  }

  const piece = state.state.pieces.find((item) => item.id === selectedPieceId);
  if (!piece || piece.owner !== state.you) {
    return { ok: false, reason: 'PIECE_NOT_FOUND' };
  }

  const command: Command = {
    actorPlayerId: state.you,
    intent: {
      type: 'Move',
      pieceId: selectedPieceId,
      to,
    },
  };

  return {
    ok: true,
    message: {
      type: 'INTENT',
      payload: {
        expectedTurn: state.state.turn,
        command,
      },
    },
    nextSelectedPieceId: null,
  };
}

export function createEndTurnIntent(state: ClientState): EndTurnIntentResult {
  if (!state.state) {
    return { ok: false, reason: 'STATE_UNAVAILABLE' };
  }

  if (!state.you) {
    return { ok: false, reason: 'SEAT_UNASSIGNED' };
  }

  if (!canAct(state)) {
    return { ok: false, reason: 'NOT_YOUR_TURN' };
  }

  const command: Command = {
    actorPlayerId: state.you,
    intent: {
      type: 'EndTurn',
    },
  };

  return {
    ok: true,
    message: {
      type: 'INTENT',
      payload: {
        expectedTurn: state.state.turn,
        command,
      },
    },
  };
}
