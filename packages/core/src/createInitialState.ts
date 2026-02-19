import type { GameState } from './types.js';

export function createInitialState(): GameState {
  return {
    turn: 1,
    players: ['p1', 'p2'],
    activePlayer: 'p1',
    pieces: [
      { id: 'p1_1', owner: 'p1', position: { x: 0, y: 0 } },
      { id: 'p2_1', owner: 'p2', position: { x: 6, y: 6 } },
    ],
  };
}
