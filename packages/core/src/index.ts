export type GameState = {
  turn: number;
};

export function createInitialState(): GameState {
  return { turn: 1 };
}
