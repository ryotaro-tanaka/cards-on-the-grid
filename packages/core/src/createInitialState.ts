import type { GameState } from './types.js';

const CREATURE_BASE_STATS = {
  Ameba: { maxHp: 1, attack: 1, successorCost: 1 },
  Goblin: { maxHp: 2, attack: 2, successorCost: 2 },
  Soldier: { maxHp: 3, attack: 3, successorCost: 3 },
} as const;

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
      {
        id: 'p1_1',
        owner: 'p1',
        kind: 'Ameba',
        stats: CREATURE_BASE_STATS.Ameba,
        currentHp: CREATURE_BASE_STATS.Ameba.maxHp,
        position: { x: 0, y: 0 },
      },
      {
        id: 'p2_1',
        owner: 'p2',
        kind: 'Ameba',
        stats: CREATURE_BASE_STATS.Ameba,
        currentHp: CREATURE_BASE_STATS.Ameba.maxHp,
        position: { x: 6, y: 6 },
      },
    ],
  };
}
