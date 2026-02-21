import assert from 'node:assert/strict';
import { createInitialState } from '../packages/core/dist/index.js';
import {
  buildBoardViewModel,
  buildViewModel,
  canAct,
  createEmptyClientState,
  createEndTurnIntent,
  createMoveIntent,
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

console.log('frontend-unit: ok');
