import type { ClientState } from './types.js';

export type ViewModel = {
  roomLabel: string;
  turnLabel: string;
  canOperate: boolean;
  errorMessage: string | null;
};

export function buildViewModel(state: ClientState): ViewModel {
  const roomLabel = state.roomId ? `${state.roomId} (${state.roomStatus ?? 'unknown'})` : 'room: not joined';
  const turnLabel = state.state ? `turn: ${state.state.turn} / active: ${state.state.activePlayer}` : 'turn: -';
  const canOperate = Boolean(state.state && state.you && state.state.activePlayer === state.you);
  const errorMessage = state.lastReject ? `${state.lastReject.reason} (expectedTurn=${state.lastReject.expectedTurn})` : null;

  return {
    roomLabel,
    turnLabel,
    canOperate,
    errorMessage,
  };
}
