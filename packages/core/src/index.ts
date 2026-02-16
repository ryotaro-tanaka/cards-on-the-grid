import { GameState, Intent, Event } from './types';

export { GameState, Intent, Event };

export function createInitialState(): GameState {
  return { turn: 1 };
}
