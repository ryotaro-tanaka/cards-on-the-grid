import type { CreatureKind, CreatureStats, GameState, Piece, PlayerId } from './types.js';

const CREATURE_BASE_STATS: Record<CreatureKind, CreatureStats> = {
  Ameba: { maxHp: 1, attack: 1, successorCost: 1 },
  Goblin: { maxHp: 2, attack: 2, successorCost: 2 },
  Soldier: { maxHp: 3, attack: 3, successorCost: 3 },
};

function buildPiece(owner: PlayerId, kind: CreatureKind, position: { x: number; y: number }): Piece {
  const stats = CREATURE_BASE_STATS[kind];

  return {
    id: `${owner}_${kind.toLowerCase()}_${position.x}_${position.y}`,
    owner,
    kind,
    stats,
    currentHp: stats.maxHp,
    position,
  };
}

export function createInitialState(): GameState {
  return {
    turn: 1,
    players: ['p1', 'p2'],
    activePlayer: 'p1',
    phase: 'Main',
    status: 'InProgress',
    winner: null,
    turnState: {
      movedPieceIds: [],
    },
    pendingSuccessors: [],
    pieces: [
      buildPiece('p1', 'Ameba', { x: 0, y: 0 }),
      buildPiece('p1', 'Goblin', { x: 1, y: 0 }),
      buildPiece('p1', 'Soldier', { x: 2, y: 0 }),
      buildPiece('p2', 'Ameba', { x: 6, y: 6 }),
      buildPiece('p2', 'Goblin', { x: 5, y: 6 }),
      buildPiece('p2', 'Soldier', { x: 4, y: 6 }),
    ],
  };
}
