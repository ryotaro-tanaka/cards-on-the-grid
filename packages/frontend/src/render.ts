import type { ClientState, RejectReason, RoomStatus } from './types.js';
import { buildBoardViewModel, canAct, type BoardViewModel } from './ui.js';

export type ViewModel = {
  roomLabel: string;
  roomStatusLabel: string;
  turnLabel: string;
  actionAvailabilityMessage: string;
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
  const errorMessage = state.lastReject
    ? `${describeRejectReason(state.lastReject.reason)} (expected turn: ${state.lastReject.expectedTurn})`
    : null;

  return {
    roomLabel,
    roomStatusLabel: describeRoomStatus(state.roomStatus),
    turnLabel,
    actionAvailabilityMessage: describeActionAvailability(state, canOperate),
    canOperate,
    canEndTurn: canOperate,
    selectedPieceId,
    board: buildBoardViewModel(state, selectedPieceId),
    errorMessage,
  };
}

export function describeRoomStatus(status: RoomStatus | null): string {
  if (status === 'waiting') {
    return 'waiting for opponent';
  }

  if (status === 'started') {
    return 'match in progress';
  }

  if (status === 'finished') {
    return 'match finished';
  }

  return 'room status unknown';
}

export function describeRejectReason(reason: RejectReason): string {
  const messages: Record<RejectReason, string> = {
    TURN_MISMATCH: 'Turn mismatch. Please resync and try again.',
    NOT_ACTIVE_PLAYER: 'It is not your turn.',
    PIECE_NOT_FOUND: 'Selected piece does not exist.',
    PIECE_NOT_OWNED_BY_ACTOR: 'You can only control your own piece.',
    OUT_OF_BOUNDS: 'Target cell is outside the board.',
    GAME_ALREADY_FINISHED: 'Game has already finished.',
    PHASE_MISMATCH: 'This action is not available in the current phase.',
    INVALID_MOVE_DISTANCE: 'Move distance is invalid for this piece.',
    SAME_POSITION: 'Target cell must be different from current position.',
    CELL_OCCUPIED: 'Target cell is occupied.',
    MOVE_ALREADY_USED_THIS_TURN: 'That piece has already moved this turn.',
    ROOM_FULL: 'Room is full.',
    SEAT_UNASSIGNED: 'Seat is not assigned yet.',
    INVALID_PLAYER_ID: 'Invalid player identity.',
  };

  return messages[reason];
}

function describeActionAvailability(state: ClientState, canOperateNow: boolean): string {
  if (state.roomStatus !== 'started') {
    return '操作待機中: 対戦開始を待っています。';
  }

  if (!state.you || !state.state) {
    return '操作待機中: プレイヤー情報を同期中です。';
  }

  if (!canOperateNow) {
    return `操作不可: 相手(${state.state.activePlayer})のターンです。`;
  }

  return '操作可能: あなたのターンです。';
}
