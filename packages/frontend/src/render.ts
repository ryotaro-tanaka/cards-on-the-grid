import type { Command, Coord } from '../../core/src/index.js';
import type { ClientState, DebugMessage, IncomingMessage, OutgoingMessage, RejectReason, RoomStatus } from './types.js';
import { buildBoardViewModel, canAct, createEndTurnIntent, createMoveIntent, selectPiece, type BoardViewModel } from './ui.js';

export type ViewModel = {
  roomLabel: string;
  playerSeatLabel: string;
  roomStatusLabel: string;
  turnLabel: string;
  connectionLabel: string;
  actionAvailabilityMessage: string;
  matchResultMessage: string | null;
  canOperate: boolean;
  canEndTurn: boolean;
  canRematch: boolean;
  selectedPieceId: string | null;
  board: BoardViewModel;
  errorMessage: string | null;
  debugMessages: DebugMessage[];
};

export type RenderCallbacks = {
  onSendIntent: (command: Command, expectedTurn: number) => void;
  onReconnect?: () => void;
  onRematch?: () => void;
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
    playerSeatLabel: describePlayerSeat(state.you),
    roomStatusLabel: describeRoomStatus(state.roomStatus),
    turnLabel,
    connectionLabel: describeConnectionStatus(state.connectionStatus, state.isResyncing),
    actionAvailabilityMessage: describeActionAvailability(state, canOperate),
    matchResultMessage: describeMatchResult(state),
    canOperate,
    canEndTurn: canOperate,
    canRematch: state.roomStatus === 'finished' && Boolean(state.you && state.roomId),
    selectedPieceId,
    board: buildBoardViewModel(state, selectedPieceId),
    errorMessage,
    debugMessages: state.debugMessages,
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

export function describePlayerSeat(playerId: ClientState['you']): string {
  if (!playerId) {
    return 'あなたの席: 割り当て待ち';
  }

  return `あなたの席: ${playerId}`;
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
    return 'Finished';
  }

  if (state.state.winner === state.you) {
    return 'Win';
  }

  return 'Lose';
}

function summarizeIncomingMessage(message: IncomingMessage): string {
  if (message.type === 'WELCOME') {
    return `WELCOME ${message.payload.roomId} turn:${message.payload.state.turn}`;
  }

  if (message.type === 'EVENT') {
    return `EVENT ${message.payload.event.type} turn:${message.payload.seq}`;
  }

  if (message.type === 'SYNC') {
    return `SYNC turn:${message.payload.state.turn} seq:${message.payload.seq}`;
  }

  return `REJECT ${message.payload.reason} turn:${message.payload.expectedTurn}`;
}

function summarizeOutgoingMessage(message: OutgoingMessage): string {
  if (message.type === 'HELLO') {
    return `HELLO player:${message.payload.playerId ?? 'auto'}`;
  }

  if (message.type === 'INTENT') {
    return `INTENT ${message.payload.command.intent.type} turn:${message.payload.expectedTurn}`;
  }

  if (message.type === 'RESYNC_REQUEST') {
    return `RESYNC_REQUEST fromSeq:${message.payload.fromSeq}`;
  }

  return `ADMIN ${message.payload.action}`;
}

function summarizeDebugMessage(entry: DebugMessage): string {
  const prefix = entry.direction === 'server' ? 'SERVER' : 'FRONT';
  if (entry.direction === 'server') {
    return `${prefix} ${summarizeIncomingMessage(entry.message as IncomingMessage)}`;
  }

  return `${prefix} ${summarizeOutgoingMessage(entry.message as OutgoingMessage)}`;
}

function formatDebugMessage(entry: DebugMessage): string {
  return JSON.stringify(entry.message, null, 2);
}



type ZoneTone = {
  base: string;
  overlay: string;
};

function resolveZoneTone(y: number, you: ClientState['you']): ZoneTone {
  if (you === 'p1') {
    if (y === 0) return { base: '#eaf0ff', overlay: 'rgba(59, 130, 246, 0.16)' };
    if (y === 1 || y === 2) return { base: '#f2f6ff', overlay: 'rgba(59, 130, 246, 0.1)' };
    if (y === 6) return { base: '#ffeef0', overlay: 'rgba(239, 68, 68, 0.16)' };
    if (y === 4 || y === 5) return { base: '#fff5f5', overlay: 'rgba(239, 68, 68, 0.1)' };
    return { base: '#f8fafc', overlay: 'transparent' };
  }

  if (you === 'p2') {
    if (y === 6) return { base: '#eaf0ff', overlay: 'rgba(59, 130, 246, 0.16)' };
    if (y === 4 || y === 5) return { base: '#f2f6ff', overlay: 'rgba(59, 130, 246, 0.1)' };
    if (y === 0) return { base: '#ffeef0', overlay: 'rgba(239, 68, 68, 0.16)' };
    if (y === 1 || y === 2) return { base: '#fff5f5', overlay: 'rgba(239, 68, 68, 0.1)' };
    return { base: '#f8fafc', overlay: 'transparent' };
  }

  return { base: '#f8fafc', overlay: 'transparent' };
}

export function createDomRenderer(root: HTMLElement, callbacks: RenderCallbacks): DomRenderer {
  let selectedPieceId: string | null = null;
  let expandedDebugIndex: number | null = null;

  const render = (state: ClientState) => {
    const viewModel = buildViewModel(state, selectedPieceId);
    root.replaceChildren();

    const title = document.createElement('h1');
    title.textContent = 'Cards on the Grid';
    root.appendChild(title);

    root.appendChild(createTextElement('p', viewModel.roomLabel));
    root.appendChild(createTextElement('p', viewModel.playerSeatLabel));
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
      button.style.border = cell.isSelected
        ? '2px solid #2563eb'
        : (cell.isMovable ? '2px solid #16a34a' : '1px solid #94a3b8');
      const zoneTone = resolveZoneTone(cell.y, state.you);
      const pieceColor = cell.piece ? (cell.isOwnPiece ? '#dbeafe' : '#fee2e2') : null;
      button.style.backgroundColor = cell.isMovable ? '#dcfce7' : (pieceColor ?? zoneTone.base);
      button.style.backgroundImage = !cell.isMovable && zoneTone.overlay !== 'transparent' ? `linear-gradient(${zoneTone.overlay}, ${zoneTone.overlay})` : 'none';
      button.textContent = cell.piece
        ? `${cell.piece.owner}:${cell.piece.kind}(${cell.piece.currentHp})`
        : `${cell.x},${cell.y}`;
      button.title = cell.piece
        ? `owner: ${cell.piece.owner}\nkind: ${cell.piece.kind}\nHP: ${cell.piece.currentHp}/${cell.piece.maxHp}\nATK: ${cell.piece.attack}\nsuccessor cost: ${cell.piece.successorCost}`
        : 'empty cell';
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

    const rematchButton = document.createElement('button');
    rematchButton.type = 'button';
    rematchButton.textContent = '再戦';
    rematchButton.disabled = !viewModel.canRematch || !callbacks.onRematch;
    rematchButton.addEventListener('click', () => callbacks.onRematch?.());
    actionRow.appendChild(rematchButton);

    root.appendChild(actionRow);

    if (viewModel.debugMessages.length > 0) {
      const debugTitle = createTextElement('p', 'debug: websocket messages');
      debugTitle.style.marginTop = '12px';
      root.appendChild(debugTitle);

      const debugContainer = document.createElement('div');
      debugContainer.style.maxWidth = '420px';
      debugContainer.style.border = '1px solid #cbd5e1';
      debugContainer.style.backgroundColor = '#f8fafc';
      debugContainer.style.padding = '8px';

      viewModel.debugMessages.forEach((entry, index) => {
        const lineButton = document.createElement('button');
        lineButton.type = 'button';
        lineButton.textContent = summarizeDebugMessage(entry);
        lineButton.style.display = 'block';
        lineButton.style.width = '100%';
        lineButton.style.textAlign = 'left';
        lineButton.style.marginBottom = '4px';
        lineButton.style.border = entry.direction === 'server' ? '1px solid #94a3b8' : '1px solid #f59e0b';
        lineButton.style.backgroundColor = expandedDebugIndex === index
          ? (entry.direction === 'server' ? '#dbeafe' : '#fef3c7')
          : '#ffffff';
        lineButton.addEventListener('click', () => {
          expandedDebugIndex = expandedDebugIndex === index ? null : index;
          render(state);
        });
        debugContainer.appendChild(lineButton);

        if (expandedDebugIndex === index) {
          const detail = document.createElement('pre');
          detail.textContent = formatDebugMessage(entry);
          detail.style.whiteSpace = 'pre-wrap';
          detail.style.wordBreak = 'break-word';
          detail.style.margin = '4px 0 8px 0';
          detail.style.padding = '8px';
          detail.style.backgroundColor = '#ffffff';
          detail.style.border = '1px solid #cbd5e1';
          debugContainer.appendChild(detail);
        }
      });

      root.appendChild(debugContainer);
    }
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
