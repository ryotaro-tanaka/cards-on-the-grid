import assert from 'node:assert/strict';
import { createInitialState } from '../packages/core/dist/index.js';
import {
  buildBoardViewModel,
  buildViewModel,
  canAct,
  connect,
  createEmptyClientState,
  createEndTurnIntent,
  createMoveIntent,
  describeConnectionStatus,
  describeRejectReason,
  describeRoomStatus,
  reduceIncoming,
  selectPiece,
} from '../packages/frontend/dist/index.js';

const base = createInitialState('p1', 'p2');
let client = createEmptyClientState();
client = reduceIncoming(client, {
  type: 'WELCOME',
  payload: {
    roomId: 'room-1',
    you: 'p1',
    seq: 0,
    state: base,
    roomStatus: 'started',
  },
});

assert.equal(canAct(client), true);
assert.equal(describeRoomStatus(client.roomStatus), 'match in progress');
assert.equal(describeConnectionStatus('closed', false), 'disconnected (you can reconnect)');

const board = buildBoardViewModel(client, null);
assert.equal(board.size, 7);
assert.equal(board.cells.length, 49);
const ownPieceCell = board.cells.find((cell) => cell.piece?.owner === 'p1');
assert.ok(ownPieceCell && ownPieceCell.piece);
const ownPieceId = ownPieceCell?.piece?.id ?? '';
assert.equal(ownPieceCell?.isOwnPiece, true);

const selected = selectPiece(client, null, ownPieceId);
assert.equal(selected, ownPieceId);

const vm = buildViewModel(client, selected);
assert.equal(vm.canOperate, true);
assert.equal(vm.canEndTurn, true);
assert.equal(vm.selectedPieceId, selected);
assert.equal(vm.roomStatusLabel, 'match in progress');
assert.equal(vm.actionAvailabilityMessage, '操作可能: あなたのターンです。');
assert.equal(vm.connectionLabel, 'disconnected (you can reconnect)');
assert.equal(vm.board.cells.find((cell) => cell.piece?.id === selected)?.isSelected, true);

const move = createMoveIntent(client, selected, { x: ownPieceCell.x, y: ownPieceCell.y + 1 });
assert.equal(move.ok, true);
if (move.ok) {
  assert.equal(move.message.type, 'INTENT');
  assert.equal(move.message.payload.command.intent.type, 'Move');
  assert.equal(move.nextSelectedPieceId, null);
}

const endTurn = createEndTurnIntent(client);
assert.equal(endTurn.ok, true);
if (endTurn.ok) {
  assert.equal(endTurn.message.payload.command.intent.type, 'EndTurn');
}

const notYourTurnState = {
  ...client,
  state: {
    ...client.state,
    activePlayer: 'p2',
  },
};
assert.equal(canAct(notYourTurnState), false);
assert.equal(selectPiece(notYourTurnState, null, ownPieceId), null);

const blockedMove = createMoveIntent(notYourTurnState, ownPieceId, { x: ownPieceCell.x, y: ownPieceCell.y + 1 });
assert.equal(blockedMove.ok, false);
if (!blockedMove.ok) {
  assert.equal(blockedMove.reason, 'NOT_YOUR_TURN');
}

const vmBlocked = buildViewModel(notYourTurnState, null);
assert.equal(vmBlocked.actionAvailabilityMessage, '操作不可: 相手(p2)のターンです。');

const waitingState = {
  ...client,
  roomStatus: 'waiting',
};
assert.equal(buildViewModel(waitingState, null).actionAvailabilityMessage, '操作待機中: 対戦開始を待っています。');

const withReject = reduceIncoming(client, {
  type: 'REJECT',
  payload: {
    reason: 'TURN_MISMATCH',
    expectedTurn: 2,
  },
});
assert.equal(describeRejectReason('TURN_MISMATCH'), 'Turn mismatch. Please resync and try again.');
assert.equal(
  buildViewModel(withReject, null).errorMessage,
  'Turn mismatch. Please resync and try again. (expected turn: 2)',
);

const finishedState = {
  ...client,
  roomStatus: 'finished',
  state: {
    ...client.state,
    status: 'Finished',
    winner: 'p1',
  },
};
const vmFinished = buildViewModel(finishedState, null);
assert.equal(vmFinished.canOperate, false);
assert.equal(vmFinished.canEndTurn, false);
assert.equal(vmFinished.actionAvailabilityMessage, '操作不可: 対戦は終了しています。');
assert.equal(vmFinished.matchResultMessage, '対戦終了: あなたの勝利 (p1)');

class FakeSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = FakeSocket.CONNECTING;
    this.sent = [];
    this.onopen = null;
    this.onclose = null;
    this.onerror = null;
    this.onmessage = null;
  }

  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  receive(data) {
    this.onmessage?.({ data });
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
}

globalThis.WebSocket = FakeSocket;
const sockets = [];
const connectionStatuses = [];
const invalidFrames = [];
const connection = connect({
  baseUrl: 'ws://localhost:8787',
  roomId: 'room-1',
  playerId: 'p1',
  onConnectionStatusChange: (status) => connectionStatuses.push(status),
  onInvalidMessage: (raw) => invalidFrames.push(raw),
  webSocketFactory: (url) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  },
});

assert.equal(sockets.length, 1);
assert.equal(connectionStatuses[0], 'connecting');
sockets[0].open();
assert.equal(connectionStatuses[1], 'open');
assert.equal(sockets[0].sent[0].type, 'HELLO');

sockets[0].receive('{"type":"UNKNOWN"}');
assert.equal(invalidFrames.length, 1);

connection.reconnect();
assert.equal(sockets.length, 2);
assert.equal(connectionStatuses.at(-1), 'connecting');
sockets[1].open();
assert.equal(sockets[1].sent[0].type, 'HELLO');

connection.close();
assert.equal(connectionStatuses.at(-1), 'closed');

console.log('frontend-unit: ok');
