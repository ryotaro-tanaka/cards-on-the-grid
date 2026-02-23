import type { CardKind, Command, GameState, Piece, ValidationResult } from './types.js';

function isInBounds(x: number, y: number): boolean {
  return x >= 0 && x < 7 && y >= 0 && y < 7;
}

function isOneStepMove(fromX: number, fromY: number, toX: number, toY: number): boolean {
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);

  return (dx !== 0 || dy !== 0) && dx <= 1 && dy <= 1;
}

function isInsideOwnTerritory(y: number, owner: string): boolean {
  return owner === 'p1' ? y === 1 || y === 2 : y === 4 || y === 5;
}

function isInsideEnemyTerritory(y: number, owner: string): boolean {
  return owner === 'p1' ? y === 4 || y === 5 : y === 1 || y === 2;
}

function validateCardMoveLike(state: GameState, actorPlayerId: string, pieceId?: string, to?: { x: number; y: number }): ValidationResult {
  if (!pieceId || !to) {
    return { ok: false, reason: 'INVALID_CARD_TARGET' };
  }

  const piece = state.pieces.find((p) => p.id === pieceId);
  if (!piece) {
    return { ok: false, reason: 'PIECE_NOT_FOUND' };
  }

  if (piece.owner !== actorPlayerId) {
    return { ok: false, reason: 'PIECE_NOT_OWNED_BY_ACTOR' };
  }

  if (piece.position.x === to.x && piece.position.y === to.y) {
    return { ok: false, reason: 'SAME_POSITION' };
  }

  if (!isInBounds(to.x, to.y)) {
    return { ok: false, reason: 'OUT_OF_BOUNDS' };
  }

  if (!isOneStepMove(piece.position.x, piece.position.y, to.x, to.y)) {
    return { ok: false, reason: 'INVALID_MOVE_DISTANCE' };
  }

  const occupied = state.pieces.some((other) => other.id !== piece.id && other.position.x === to.x && other.position.y === to.y);
  if (occupied) {
    return { ok: false, reason: 'CELL_OCCUPIED' };
  }

  return { ok: true };
}

function findPiece(state: GameState, pieceId?: string): Piece | null {
  if (!pieceId) return null;
  return state.pieces.find((piece) => piece.id === pieceId) ?? null;
}

function validateUseCard(state: GameState, actorPlayerId: string, intent: Extract<Command['intent'], { type: 'UseCard' }>): ValidationResult {
  const hand = state.hands[actorPlayerId] ?? [];
  const card = hand.find((entry) => entry.id === intent.cardId);
  if (!card) {
    return { ok: false, reason: 'CARD_NOT_FOUND_IN_HAND' };
  }

  if (card.kind !== intent.cardKind) {
    return { ok: false, reason: 'CARD_KIND_MISMATCH' };
  }

  const enemyPlayerId = state.players.find((p) => p !== actorPlayerId);

  const ownedPieceKindsWithActive = new Set(['Ninja', 'Bomber', 'GiantBoa', 'Alchemist']);

  const validators: Record<CardKind, () => ValidationResult> = {
    Move: () => validateCardMoveLike(state, actorPlayerId, intent.pieceId, intent.to),
    Assault: () => validateCardMoveLike(state, actorPlayerId, intent.pieceId, intent.to),
    Arrowrain: () => {
      const target = findPiece(state, intent.targetPieceId);
      if (!target) return { ok: false, reason: 'TARGET_PIECE_NOT_FOUND' };
      if (target.owner === actorPlayerId) return { ok: false, reason: 'TARGET_PIECE_NOT_ENEMY' };
      return { ok: true };
    },
    'Rock Bombardment': () => {
      const target = findPiece(state, intent.targetPieceId);
      if (!target) return { ok: false, reason: 'TARGET_PIECE_NOT_FOUND' };
      if (target.owner === actorPlayerId) return { ok: false, reason: 'TARGET_PIECE_NOT_ENEMY' };
      if (!isInsideOwnTerritory(target.position.y, actorPlayerId)) return { ok: false, reason: 'INVALID_CARD_TARGET' };
      return { ok: true };
    },
    Lightning: () => {
      const target = findPiece(state, intent.targetPieceId);
      if (!target) return { ok: false, reason: 'TARGET_PIECE_NOT_FOUND' };
      if (target.owner === actorPlayerId) return { ok: false, reason: 'TARGET_PIECE_NOT_ENEMY' };
      if (!isInsideEnemyTerritory(target.position.y, actorPlayerId)) return { ok: false, reason: 'INVALID_CARD_TARGET' };
      return { ok: true };
    },
    Recharge: () => {
      const target = findPiece(state, intent.pieceId);
      if (!target) return { ok: false, reason: 'TARGET_PIECE_NOT_FOUND' };
      if (target.owner !== actorPlayerId) return { ok: false, reason: 'TARGET_PIECE_NOT_OWNED_BY_ACTOR' };
      if (!ownedPieceKindsWithActive.has(target.kind) || !target.activeSkillUsed) {
        return { ok: false, reason: 'ACTIVE_SKILL_NOT_APPLICABLE' };
      }
      return { ok: true };
    },
    Doping: () => {
      const target = findPiece(state, intent.pieceId);
      if (!target) return { ok: false, reason: 'TARGET_PIECE_NOT_FOUND' };
      if (target.owner !== actorPlayerId) return { ok: false, reason: 'TARGET_PIECE_NOT_OWNED_BY_ACTOR' };
      return { ok: true };
    },
    Barrier: () => {
      const target = findPiece(state, intent.pieceId);
      if (!target) return { ok: false, reason: 'TARGET_PIECE_NOT_FOUND' };
      if (target.owner !== actorPlayerId) return { ok: false, reason: 'TARGET_PIECE_NOT_OWNED_BY_ACTOR' };
      return { ok: true };
    },
    Breath: () => {
      const target = findPiece(state, intent.pieceId);
      if (!target) return { ok: false, reason: 'TARGET_PIECE_NOT_FOUND' };
      if (target.owner !== actorPlayerId) return { ok: false, reason: 'TARGET_PIECE_NOT_OWNED_BY_ACTOR' };
      return { ok: true };
    },
    Mine: () => {
      if (!intent.to) return { ok: false, reason: 'INVALID_CARD_DESTINATION' };
      if (!isInBounds(intent.to.x, intent.to.y)) return { ok: false, reason: 'OUT_OF_BOUNDS' };
      if (!isInsideOwnTerritory(intent.to.y, actorPlayerId)) return { ok: false, reason: 'INVALID_CARD_DESTINATION' };
      return { ok: true };
    },
    Stealing: () => {
      if (!intent.targetPlayerId || !enemyPlayerId || intent.targetPlayerId !== enemyPlayerId) {
        return { ok: false, reason: 'TARGET_PLAYER_INVALID' };
      }
      if ((state.hands[intent.targetPlayerId] ?? []).length === 0) {
        return { ok: false, reason: 'TARGET_PLAYER_HAND_EMPTY' };
      }
      return { ok: true };
    },
  };

  return validators[intent.cardKind]();
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

  if (intent.type === 'UseCard') {
    return validateUseCard(state, actorPlayerId, intent);
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

  const occupied = state.pieces.some(
    (other) =>
      other.id !== piece.id && other.position.x === intent.to.x && other.position.y === intent.to.y,
  );

  if (occupied) {
    return { ok: false, reason: 'CELL_OCCUPIED' };
  }

  return { ok: true };
}
