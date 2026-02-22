import type { Command, Coord, Piece } from '../../core/src/index.js';
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
};

export type BoardViewModel = {
  size: number;
  cells: CellViewModel[];
};

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

export function buildBoardViewModel(state: ClientState, selectedPieceId: string | null): BoardViewModel {
  const cells: CellViewModel[] = [];

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
