import type { Command, GameState, ValidationResult } from './types.js';

function isInBounds(x: number, y: number): boolean {
  return x >= 0 && x < 7 && y >= 0 && y < 7;
}

export function validateIntent(state: GameState, command: Command): ValidationResult {
  const { actorPlayerId, intent } = command;

  if (actorPlayerId !== state.activePlayer) {
    return { ok: false, reason: 'NOT_ACTIVE_PLAYER' };
  }

  if (intent.type === 'EndTurn') {
    return { ok: true };
  }

  const piece = state.pieces.find((p) => p.id === intent.pieceId);
  if (!piece) {
    return { ok: false, reason: 'PIECE_NOT_FOUND' };
  }

  if (piece.owner !== actorPlayerId) {
    return { ok: false, reason: 'PIECE_NOT_OWNED_BY_ACTOR' };
  }

  if (!isInBounds(intent.to.x, intent.to.y)) {
    return { ok: false, reason: 'OUT_OF_BOUNDS' };
  }

  return { ok: true };
}
