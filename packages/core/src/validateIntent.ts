import type { Command, GameState, ValidationResult } from './types.js';

function isInBounds(x: number, y: number): boolean {
  return x >= 0 && x < 7 && y >= 0 && y < 7;
}

function isOneStepMove(fromX: number, fromY: number, toX: number, toY: number): boolean {
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);

  return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
}

export function validateIntent(state: GameState, command: Command): ValidationResult {
  const { actorPlayerId, intent } = command;

  if (state.status === 'Finished') {
    return { ok: false, reason: 'GAME_ALREADY_FINISHED' };
  }

  if (actorPlayerId !== state.activePlayer) {
    return { ok: false, reason: 'NOT_ACTIVE_PLAYER' };
  }

  if (state.phase !== 'Main') {
    return { ok: false, reason: 'PHASE_MISMATCH' };
  }

  if (intent.type === 'EndTurn') {
    return { ok: true };
  }

  if (state.turnState.movedPieceIds.length > 0) {
    return { ok: false, reason: 'MOVE_ALREADY_USED_THIS_TURN' };
  }

  const piece = state.pieces.find((p) => p.id === intent.pieceId);
  if (!piece) {
    return { ok: false, reason: 'PIECE_NOT_FOUND' };
  }

  if (piece.owner !== actorPlayerId) {
    return { ok: false, reason: 'PIECE_NOT_OWNED_BY_ACTOR' };
  }

  if (state.turnState.movedPieceIds.includes(piece.id)) {
    return { ok: false, reason: 'MOVE_ALREADY_USED_THIS_TURN' };
  }

  if (piece.position.x === intent.to.x && piece.position.y === intent.to.y) {
    return { ok: false, reason: 'SAME_POSITION' };
  }

  if (!isInBounds(intent.to.x, intent.to.y)) {
    return { ok: false, reason: 'OUT_OF_BOUNDS' };
  }

  if (!isOneStepMove(piece.position.x, piece.position.y, intent.to.x, intent.to.y)) {
    return { ok: false, reason: 'INVALID_MOVE_DISTANCE' };
  }

  const occupiedByAlly = state.pieces.some(
    (other) =>
      other.id !== piece.id &&
      other.owner === actorPlayerId &&
      other.position.x === intent.to.x &&
      other.position.y === intent.to.y,
  );

  if (occupiedByAlly) {
    return { ok: false, reason: 'CELL_OCCUPIED' };
  }

  return { ok: true };
}
