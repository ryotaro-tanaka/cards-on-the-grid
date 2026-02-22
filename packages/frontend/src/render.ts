import type { Command, Coord } from '../../core/dist/index.js';
import type { ClientState, RejectReason, RoomStatus } from './types.js';
import { buildBoardViewModel, canAct, createEndTurnIntent, createMoveIntent, selectPiece, type BoardViewModel } from './ui.js';

export type ViewModel = {
  roomLabel: string;
  roomStatusLabel: string;
  turnLabel: string;
  connectionLabel: string;
  actionAvailabilityMessage: string;
  matchResultMessage: string | null;
  canOperate: boolean;
  canEndTurn: boolean;
  selectedPieceId: string | null;
  board: BoardViewModel;
  errorMessage: string | null;
  debugIncomingMessages: string[];
};

export type RenderCallbacks = {
  onSendIntent: (command: Command, expectedTurn: number) => void;
  onReconnect?: () => void;
};

export type DomRenderer = {
  render: (state: ClientState) => void;
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
    connectionLabel: describeConnectionStatus(state.connectionStatus, state.isResyncing),
    actionAvailabilityMessage: describeActionAvailability(state, canOperate),
    matchResultMessage: describeMatchResult(state),
    canOperate,
    canEndTurn: canOperate,
    selectedPieceId,
    board: buildBoardViewModel(state, selectedPieceId),
    errorMessage,
    debugIncomingMessages: state.debugIncomingMessages,
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

export function describeConnectionStatus(connectionStatus: ClientState['connectionStatus'], isResyncing: boolean): string {
  if (isResyncing) {
    return 'resyncing game state...';
  }

  if (connectionStatus === 'open') {
    return 'connected';
  }

  if (connectionStatus === 'connecting') {
    return 'connecting...';
  }

  return 'disconnected (you can reconnect)';
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
  if (state.roomStatus === 'finished') {
    return '操作不可: 対戦は終了しています。';
  }

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

function describeMatchResult(state: ClientState): string | null {
  if (state.roomStatus !== 'finished') {
    return null;
  }

  if (!state.state?.winner || !state.you) {
    return '対戦終了';
  }

  if (state.state.winner === state.you) {
    return `対戦終了: あなたの勝利 (${state.state.winner})`;
  }

  return `対戦終了: あなたの敗北 (winner: ${state.state.winner})`;
}

export function createDomRenderer(root: HTMLElement, callbacks: RenderCallbacks): DomRenderer {
  let selectedPieceId: string | null = null;

  const render = (state: ClientState) => {
    const viewModel = buildViewModel(state, selectedPieceId);
    root.replaceChildren();

    const title = document.createElement('h1');
    title.textContent = 'Cards on the Grid';
    root.appendChild(title);

    root.appendChild(createTextElement('p', viewModel.roomLabel));
    root.appendChild(createTextElement('p', viewModel.roomStatusLabel));
    root.appendChild(createTextElement('p', viewModel.turnLabel));
    root.appendChild(createTextElement('p', viewModel.connectionLabel));
    root.appendChild(createTextElement('p', viewModel.actionAvailabilityMessage));

    if (viewModel.matchResultMessage) {
      root.appendChild(createTextElement('p', viewModel.matchResultMessage));
    }

    if (viewModel.errorMessage) {
      const alert = createTextElement('p', viewModel.errorMessage);
      alert.setAttribute('role', 'alert');
      root.appendChild(alert);
    }

    if (viewModel.debugIncomingMessages.length > 0) {
      const debugTitle = createTextElement('p', 'debug: server responses');
      root.appendChild(debugTitle);

      const debugLog = document.createElement('pre');
      debugLog.textContent = viewModel.debugIncomingMessages.join('\n');
      debugLog.style.whiteSpace = 'pre-wrap';
      debugLog.style.wordBreak = 'break-word';
      debugLog.style.maxWidth = '420px';
      debugLog.style.maxHeight = '180px';
      debugLog.style.overflow = 'auto';
      debugLog.style.padding = '8px';
      debugLog.style.border = '1px solid #cbd5e1';
      debugLog.style.backgroundColor = '#f8fafc';
      root.appendChild(debugLog);
    }

    const board = document.createElement('div');
    board.style.display = 'grid';
    board.style.gridTemplateColumns = `repeat(${viewModel.board.size}, minmax(44px, 1fr))`;
    board.style.gap = '4px';
    board.style.maxWidth = '420px';

    for (const cell of viewModel.board.cells) {
      const button = document.createElement('button');
      button.type = 'button';
      button.disabled = !viewModel.canOperate;
      button.style.minHeight = '44px';
      button.style.border = cell.isSelected ? '2px solid #2563eb' : '1px solid #94a3b8';
      button.style.backgroundColor = cell.piece ? (cell.isOwnPiece ? '#dbeafe' : '#fee2e2') : '#f8fafc';
      button.textContent = cell.piece
        ? `${cell.piece.owner}:${cell.piece.kind}(${cell.piece.currentHp})`
        : `${cell.x},${cell.y}`;
      button.addEventListener('click', () => {
        if (cell.piece && cell.isOwnPiece) {
          selectedPieceId = selectPiece(state, selectedPieceId, cell.piece.id);
          render(state);
          return;
        }

        const moveIntent = createMoveIntent(state, selectedPieceId, toCoord(cell.x, cell.y));
        if (!moveIntent.ok) {
          return;
        }

        callbacks.onSendIntent(moveIntent.message.payload.command, moveIntent.message.payload.expectedTurn);
        selectedPieceId = moveIntent.nextSelectedPieceId;
        render(state);
      });
      board.appendChild(button);
    }

    root.appendChild(board);

    const actionRow = document.createElement('div');
    actionRow.style.display = 'flex';
    actionRow.style.gap = '8px';
    actionRow.style.marginTop = '12px';

    const endTurnButton = document.createElement('button');
    endTurnButton.type = 'button';
    endTurnButton.textContent = 'ターン終了';
    endTurnButton.disabled = !viewModel.canEndTurn;
    endTurnButton.addEventListener('click', () => {
      const endTurnIntent = createEndTurnIntent(state);
      if (!endTurnIntent.ok) {
        return;
      }

      callbacks.onSendIntent(endTurnIntent.message.payload.command, endTurnIntent.message.payload.expectedTurn);
    });
    actionRow.appendChild(endTurnButton);

    const reconnectButton = document.createElement('button');
    reconnectButton.type = 'button';
    reconnectButton.textContent = '再接続';
    reconnectButton.disabled = !callbacks.onReconnect;
    reconnectButton.addEventListener('click', () => callbacks.onReconnect?.());
    actionRow.appendChild(reconnectButton);

    root.appendChild(actionRow);
  };

  return { render };
}

function createTextElement(tagName: 'p', text: string): HTMLParagraphElement {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
}

function toCoord(x: number, y: number): Coord {
  return { x, y };
}
