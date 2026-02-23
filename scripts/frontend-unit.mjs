import assert from 'node:assert/strict';
import { createInitialState } from '../packages/core/dist/index.js';
import {
  buildBoardViewModel,
  buildHandViewModel,
  buildViewModel,
  canAct,
  connect,
  createEmptyClientState,
  createEndTurnIntent,
  createMoveIntent,
  createUseCardIntent,
  describeConnectionStatus,
  describePlayerSeat,
  describeRejectReason,
  describeRoomStatus,
  resolveWebSocketBaseUrl,
  attachPwaMetadata,
  registerServiceWorker,
  reduceClientState,
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

const withOutgoing = reduceClientState(client, {
  type: 'MESSAGE_SENT',
  payload: {
    type: 'RESYNC_REQUEST',
    payload: { fromSeq: 0 },
  },
});
assert.equal(withOutgoing.debugMessages.at(-1)?.direction, 'client');
assert.equal(withOutgoing.debugMessages.at(-1)?.message.type, 'RESYNC_REQUEST');

assert.equal(canAct(client), true);
assert.equal(describeRoomStatus(client.roomStatus), 'match in progress');
assert.equal(describePlayerSeat(client.you), 'あなたの席: p1');
assert.equal(describePlayerSeat(null), 'あなたの席: 割り当て待ち');
assert.equal(describeConnectionStatus('closed', false), 'disconnected (you can reconnect)');

assert.equal(
  resolveWebSocketBaseUrl({
    configuredBaseUrl: '',
    locationOrigin: 'https://e1521436.cards-on-the-grid-frontend.pages.dev',
    locationHostname: 'e1521436.cards-on-the-grid-frontend.pages.dev',
  }),
  '',
);
assert.equal(
  resolveWebSocketBaseUrl({
    configuredBaseUrl: '',
    locationOrigin: 'http://localhost:5173',
    locationHostname: 'localhost',
  }),
  'ws://localhost:5173',
);
assert.equal(
  resolveWebSocketBaseUrl({
    configuredBaseUrl: 'wss://cards-on-the-grid-backend.example.workers.dev',
    locationOrigin: 'https://app.example.com',
    locationHostname: 'app.example.com',
  }),
  'wss://cards-on-the-grid-backend.example.workers.dev',
);

const board = buildBoardViewModel(client, null, null);
assert.equal(board.size, 7);
assert.equal(board.cells.length, 49);
assert.equal(board.cells.some((cell) => cell.piece?.owner === 'p1'), true);
assert.equal(board.cells.some((cell) => cell.piece?.owner === 'p2'), true);
const ownPieceCell = board.cells.find((cell) => cell.piece?.owner === 'p1');
assert.ok(ownPieceCell && ownPieceCell.piece);
const ownPieceId = ownPieceCell?.piece?.id ?? '';
assert.equal(ownPieceCell?.piece?.attack, 1);
assert.equal(ownPieceCell?.piece?.maxHp, 1);
assert.equal(ownPieceCell?.piece?.successorCost, 1);

const boardForP2 = buildBoardViewModel({ ...client, you: 'p2' }, null, null);
assert.equal(boardForP2.cells.some((cell) => cell.piece?.owner === 'p1'), true);
assert.equal(boardForP2.cells.some((cell) => cell.piece?.owner === 'p2'), true);

const selected = selectPiece(client, null, ownPieceId);
assert.equal(selected, ownPieceId);


const boardWithSelection = buildBoardViewModel(client, ownPieceId, null);
assert.equal(boardWithSelection.cells.some((cell) => cell.isMovable), true);
assert.equal(
  boardWithSelection.cells.some((cell) =>
    cell.piece?.owner === 'p1'
    && cell.piece.id !== ownPieceId
    && cell.isMovable),
  false,
);

const vm = buildViewModel(client, selected, null);
assert.equal(vm.canOperate, true);
assert.equal(vm.canEndTurn, true);
assert.equal(vm.selectedPieceId, selected);
assert.equal(vm.roomStatusLabel, 'match in progress');
assert.equal(vm.playerSeatLabel, 'あなたの席: p1');
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

const movedAlreadyState = {
  ...client,
  state: {
    ...client.state,
    turnState: { movedPieceIds: [ownPieceId] },
  },
};
assert.equal(buildBoardViewModel(movedAlreadyState, ownPieceId).cells.some((cell) => cell.isMovable), false);

const waitingState = {
  ...client,
  roomStatus: 'waiting',
};
assert.equal(buildViewModel(waitingState, null).actionAvailabilityMessage, '操作待機中: 対戦開始を待っています。');


const finishedByEvent = reduceIncoming(client, {
  type: 'EVENT',
  payload: {
    seq: 1,
    event: {
      type: 'GameFinished',
      winner: 'p1',
    },
  },
});
assert.equal(finishedByEvent.roomStatus, 'finished');
assert.equal(canAct(finishedByEvent), false);

const withReject = reduceIncoming(client, {
  type: 'REJECT',
  payload: {
    reason: 'TURN_MISMATCH',
    expectedTurn: 2,
  },
});
assert.equal(describeRejectReason('TURN_MISMATCH'), 'Turn mismatch. Please resync and try again.');
assert.equal(describeRejectReason('INVALID_CARD_TARGET'), 'Invalid target for this card.');
assert.equal(
  buildViewModel(withReject, null).errorMessage,
  'Turn mismatch. Please resync and try again. (expected turn: 2)',
);
assert.equal(withReject.debugMessages.length, 2);
assert.equal(withReject.debugMessages.at(-1)?.direction, 'server');
assert.equal(withReject.debugMessages.at(-1)?.message.type, 'REJECT');

let cappedDebugState = client;
for (let i = 0; i < 35; i += 1) {
  cappedDebugState = reduceIncoming(cappedDebugState, {
    type: 'REJECT',
    payload: {
      reason: 'TURN_MISMATCH',
      expectedTurn: i,
    },
  });
}
assert.equal(cappedDebugState.debugMessages.length, 30);

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
assert.equal(vmFinished.matchResultMessage, 'Win');
assert.equal(vmFinished.canRematch, true);


const vmFinishedLose = buildViewModel({
  ...finishedState,
  you: 'p1',
  state: {
    ...finishedState.state,
    winner: 'p2',
  },
}, null);
assert.equal(vmFinishedLose.matchResultMessage, 'Lose');



const handVm = buildHandViewModel(client);
assert.equal(handVm.length >= 1, true);

const cardClient = {
  ...client,
  state: {
    ...client.state,
    hands: {
      ...client.state.hands,
      p1: [{ id: 'c_mine', kind: 'Mine' }, { id: 'c_steal', kind: 'Stealing' }],
      p2: [{ id: 'c_enemy', kind: 'Barrier' }],
    },
  },
};
const mineBoard = buildBoardViewModel(cardClient, ownPieceId, 'c_mine');
assert.equal(mineBoard.cells.some((cell) => cell.isMinePlaceable), true);

const useSteal = createUseCardIntent(cardClient, 'c_steal', ownPieceId, { x: 0, y: 0 });
assert.equal(useSteal.ok, true);
if (useSteal.ok) {
  assert.equal(useSteal.message.payload.command.intent.type, 'UseCard');
  assert.equal(useSteal.message.payload.command.intent.cardKind, 'Stealing');
}

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


const loggedMessages = [];
const originalConsoleLog = console.log;
console.log = (...args) => {
  loggedMessages.push(args);
};

globalThis.WebSocket = FakeSocket;
const sockets = [];
const connectionStatuses = [];
const invalidFrames = [];
const outgoingMessages = [];
const connection = connect({
  baseUrl: 'ws://localhost:8787',
  roomId: 'room-1',
  playerId: 'p1',
  onConnectionStatusChange: (status) => connectionStatuses.push(status),
  onInvalidMessage: (raw) => invalidFrames.push(raw),
  onMessageSent: (message) => outgoingMessages.push(message),
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
assert.equal(sockets[0].sent[0].payload.playerId, 'p1');
assert.equal(outgoingMessages[0].type, 'HELLO');

sockets[0].receive('{"type":"UNKNOWN"}');
assert.equal(invalidFrames.length, 1);


sockets[0].receive(JSON.stringify({
  type: 'REJECT',
  payload: {
    reason: 'TURN_MISMATCH',
    expectedTurn: 1,
  },
}));
assert.equal(loggedMessages.some((entry) => entry[0] === '[server-response]' && entry[1].includes('TURN_MISMATCH')), true);


connection.reconnect();
assert.equal(sockets.length, 2);
assert.equal(connectionStatuses.at(-1), 'connecting');
sockets[1].open();
assert.equal(sockets[1].sent[0].type, 'HELLO');

connection.rematch();
assert.equal(sockets[1].sent.at(-1)?.type, 'ADMIN');
assert.equal(sockets[1].sent.at(-1)?.payload.action, 'DESTROY_ROOM');
assert.equal(sockets.length, 3);
assert.equal(connectionStatuses.at(-1), 'connecting');
sockets[2].open();
assert.equal(sockets[2].sent[0].type, 'HELLO');
assert.equal(outgoingMessages.some((message) => message.type === 'ADMIN'), true);

const autoSockets = [];
const autoConnection = connect({
  baseUrl: 'ws://localhost:8787',
  roomId: 'room-1',
  playerId: 'auto',
  webSocketFactory: (url) => {
    const socket = new FakeSocket(url);
    autoSockets.push(socket);
    return socket;
  },
});
autoSockets[0].open();
assert.equal(autoSockets[0].sent[0].type, 'HELLO');
assert.equal(Object.hasOwn(autoSockets[0].sent[0].payload, 'playerId'), false);
autoConnection.close();

connection.close();
assert.equal(connectionStatuses.at(-1), 'closed');

const createdElements = [];
const headChildren = [];
const fakeHead = {
  querySelector(selector) {
    if (selector === 'link[rel="manifest"]') {
      return headChildren.find((item) => item.tagName === 'LINK' && item.rel === 'manifest') ?? null;
    }
    if (selector === 'meta[name="theme-color"]') {
      return headChildren.find((item) => item.tagName === 'META' && item.name === 'theme-color') ?? null;
    }
    return null;
  },
  appendChild(element) {
    headChildren.push(element);
    return element;
  },
};

globalThis.document = {
  createElement(tagName) {
    const base = { tagName: tagName.toUpperCase() };
    createdElements.push(base);
    return base;
  },
};

attachPwaMetadata(fakeHead);
const manifestLink = headChildren.find((item) => item.tagName === 'LINK');
const themeMeta = headChildren.find((item) => item.tagName === 'META');
assert.equal(manifestLink?.href, '/manifest.webmanifest');
assert.equal(themeMeta?.content, '#0f172a');

attachPwaMetadata(fakeHead, { manifestPath: '/app.webmanifest', themeColor: '#111111' });
assert.equal(headChildren.length, 2);
assert.equal(manifestLink?.href, '/app.webmanifest');
assert.equal(themeMeta?.content, '#111111');

const registeredPaths = [];
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
  serviceWorker: {
    register: async (path) => {
      registeredPaths.push(path);
      return {};
    },
  },
  },
});

assert.equal(await registerServiceWorker(), true);
assert.equal(registeredPaths[0], '/sw.js');
assert.equal(await registerServiceWorker({ serviceWorkerPath: '/worker.js' }), true);
assert.equal(registeredPaths[1], '/worker.js');

Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: undefined,
});
assert.equal(await registerServiceWorker(), false);

console.log = originalConsoleLog;
console.log('frontend-unit: ok');

// フェーズ5: reducer のカードイベント反映
{
  const drawn = reduceIncoming(client, {
    type: 'EVENT',
    payload: {
      seq: client.seq + 1,
      event: { type: 'CardDrawn', playerId: 'p1', card: { id: 'x1', kind: 'Mine' } },
    },
  });
  assert.equal(drawn.state.hands.p1.some((c) => c.id === 'x1'), true);

  const used = reduceIncoming(drawn, {
    type: 'EVENT',
    payload: {
      seq: drawn.seq + 1,
      event: { type: 'CardUsed', playerId: 'p1', cardId: 'x1', cardKind: 'Mine' },
    },
  });
  assert.equal(used.state.hands.p1.some((c) => c.id === 'x1'), false);

  const mined = reduceIncoming(used, {
    type: 'EVENT',
    payload: {
      seq: used.seq + 1,
      event: { type: 'MinePlaced', owner: 'p1', position: { x: 0, y: 1 } },
    },
  });
  assert.equal(mined.state.mines.some((m) => m.position.x === 0 && m.position.y === 1), true);
}

// フェーズ5: UI操作から UseCard payload 検証
{
  const cardState = {
    ...client,
    state: {
      ...client.state,
      hands: {
        ...client.state.hands,
        p1: [{ id: 'c_arrow', kind: 'Arrowrain' }, { id: 'c_mine', kind: 'Mine' }],
      },
    },
  };

  const enemyCell = buildBoardViewModel(cardState, null, null).cells.find((cell) => cell.piece?.owner === 'p2');
  assert.ok(enemyCell && enemyCell.piece);

  const arrow = createUseCardIntent(cardState, 'c_arrow', null, { x: enemyCell.x, y: enemyCell.y });
  assert.equal(arrow.ok, true);
  if (arrow.ok) {
    assert.equal(arrow.message.payload.command.intent.type, 'UseCard');
    assert.equal(arrow.message.payload.command.intent.cardKind, 'Arrowrain');
    assert.equal(arrow.message.payload.command.intent.targetPieceId, enemyCell.piece.id);
  }

  const mine = createUseCardIntent(cardState, 'c_mine', null, { x: 0, y: 1 });
  assert.equal(mine.ok, true);
  if (mine.ok) {
    assert.equal(mine.message.payload.command.intent.type, 'UseCard');
    assert.equal(mine.message.payload.command.intent.cardKind, 'Mine');
    assert.deepEqual(mine.message.payload.command.intent.to, { x: 0, y: 1 });
  }
}
