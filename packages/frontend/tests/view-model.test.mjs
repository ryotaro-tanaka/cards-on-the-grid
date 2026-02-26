import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../core/dist/index.js';
import {
  createEmptyClientState,
  reduceIncoming,
  buildBoardViewModel,
  buildViewModel,
  describeConnectionStatus,
  describePlayerSeat,
  describeRoomStatus,
} from '../dist/index.js';

test('view model: room/seat/boardの主要表示が期待通り', () => {
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

  assert.equal(describeRoomStatus(client.roomStatus), 'match in progress');
  assert.equal(describePlayerSeat(client.you), 'あなたの席: p1');
  assert.equal(describeConnectionStatus('closed', false), 'disconnected (you can reconnect)');

  const board = buildBoardViewModel(client, null, null);
  assert.equal(board.size, 7);
  assert.equal(board.cells.length, 49);
  assert.equal(board.cells.some((c) => c.piece?.owner === 'p1'), true);
  assert.equal(board.cells.some((c) => c.piece?.owner === 'p2'), true);

  const vm = buildViewModel(client, null, null);
  assert.equal(vm.canOperate, true);
  assert.equal(vm.canEndTurn, true);
  assert.equal(vm.roomStatusLabel, 'match in progress');
});
