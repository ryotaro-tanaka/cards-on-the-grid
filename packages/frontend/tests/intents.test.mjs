import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../core/dist/index.js';
import {
  createEmptyClientState,
  reduceIncoming,
  createMoveIntent,
  createUseCardIntent,
  buildBoardViewModel,
} from '../dist/index.js';

test('intents: Move/UseCardのpayloadが正しく構築される', () => {
  const base = createInitialState('p1', 'p2');
  let client = createEmptyClientState();
  client = reduceIncoming(client, {
    type: 'WELCOME',
    payload: {
      roomId: 'room-1',
      you: 'p1',
      seq: 0,
      state: {
        ...base,
        hands: {
          ...base.hands,
          p1: [{ id: 'c_arrow', kind: 'Arrowrain' }, { id: 'c_mine', kind: 'Mine' }],
        },
      },
      roomStatus: 'started',
    },
  });

  const own = buildBoardViewModel(client, null, null).cells.find((cell) => cell.piece?.owner === 'p1');
  const enemy = buildBoardViewModel(client, null, null).cells.find((cell) => cell.piece?.owner === 'p2');
  assert.ok(own && own.piece);
  assert.ok(enemy && enemy.piece);

  const move = createMoveIntent(client, own.piece.id, { x: own.x, y: own.y + 1 });
  assert.equal(move.ok, true);

  const arrow = createUseCardIntent(client, 'c_arrow', null, { x: enemy.x, y: enemy.y });
  assert.equal(arrow.ok, true);
  if (arrow.ok) {
    assert.equal(arrow.message.payload.command.intent.type, 'UseCard');
    assert.equal(arrow.message.payload.command.intent.cardKind, 'Arrowrain');
    assert.equal(arrow.message.payload.command.intent.targetPieceId, enemy.piece.id);
  }

  const mine = createUseCardIntent(client, 'c_mine', null, { x: 0, y: 1 });
  assert.equal(mine.ok, true);
  if (mine.ok) {
    assert.equal(mine.message.payload.command.intent.type, 'UseCard');
    assert.equal(mine.message.payload.command.intent.cardKind, 'Mine');
    assert.deepEqual(mine.message.payload.command.intent.to, { x: 0, y: 1 });
  }
});
