import type { ClientState } from './types.js';
import { buildBoardViewModel, canAct, type BoardViewModel } from './ui.js';

export type ViewModel = {
  roomLabel: string;
  turnLabel: string;
  canOperate: boolean;
  canEndTurn: boolean;
  selectedPieceId: string | null;
  board: BoardViewModel;
  errorMessage: string | null;
};

export function buildViewModel(state: ClientState, selectedPieceId: string | null): ViewModel {
  const roomLabel = state.roomId ? `${state.roomId} (${state.roomStatus ?? 'unknown'})` : 'room: not joined';
  const turnLabel = state.state ? `turn: ${state.state.turn} / active: ${state.state.activePlayer}` : 'turn: -';
  const canOperate = canAct(state);
  const errorMessage = state.lastReject ? `${state.lastReject.reason} (expectedTurn=${state.lastReject.expectedTurn})` : null;

  return {
    roomLabel,
    turnLabel,
    canOperate,
    canEndTurn: canOperate,
    selectedPieceId,
    board: buildBoardViewModel(state, selectedPieceId),
    errorMessage,
  };
}
