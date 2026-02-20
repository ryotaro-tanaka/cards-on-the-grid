import assert from 'node:assert/strict';
import {
  applyCommand,
  applyEvent,
  createInitialState,
} from '../packages/core/dist/index.js';

function pieceAt(state, x, y) {
  return state.pieces.find((piece) => piece.position.x === x && piece.position.y === y);
}

// 正常系: 1マス移動
{
  const state = createInitialState();
  const ameba = state.pieces.find((p) => p.owner === 'p1' && p.kind === 'Ameba');
  assert.ok(ameba);

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: ameba.id, to: { x: 0, y: 1 } },
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.events[0].type, 'PieceMoved');
}

// 正常系: 移動による自動戦闘（生存）
{
  const initial = createInitialState();
  const p1Ameba = initial.pieces.find((p) => p.owner === 'p1' && p.kind === 'Ameba');
  const p2Soldier = initial.pieces.find((p) => p.owner === 'p2' && p.kind === 'Soldier');
  assert.ok(p1Ameba && p2Soldier);

  const state = {
    ...initial,
    pieces: initial.pieces.map((piece) => {
      if (piece.id === p1Ameba.id) return { ...piece, position: { x: 0, y: 0 } };
      if (piece.id === p2Soldier.id) return { ...piece, position: { x: 1, y: 1 }, currentHp: 3 };
      return piece;
    }),
  };

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: p1Ameba.id, to: { x: 1, y: 1 } },
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.events[0].type, 'CombatResolved');
  assert.equal(result.events.length, 1);
  assert.equal(pieceAt(result.state, 1, 1)?.id, p2Soldier.id);
}

// 正常系: 死亡と補充
{
  const initial = createInitialState();
  const p1Soldier = initial.pieces.find((p) => p.owner === 'p1' && p.kind === 'Soldier');
  const p2Ameba = initial.pieces.find((p) => p.owner === 'p2' && p.kind === 'Ameba');
  assert.ok(p1Soldier && p2Ameba);

  let state = {
    ...initial,
    pieces: initial.pieces.map((piece) => {
      if (piece.id === p1Soldier.id) return { ...piece, position: { x: 2, y: 2 } };
      if (piece.id === p2Ameba.id) return { ...piece, position: { x: 3, y: 3 }, currentHp: 1 };
      return piece;
    }),
  };

  const combat = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: p1Soldier.id, to: { x: 3, y: 3 } },
  });

  assert.equal(combat.validation.ok, true);
  assert.equal(combat.events.some((e) => e.type === 'CombatResolved'), true);
  assert.equal(combat.state.pendingSuccessors.length >= 1, true);

  state = {
    ...combat.state,
    activePlayer: 'p2',
    turnState: { movedPieceIds: [] },
  };

  const endP2 = applyCommand(state, {
    actorPlayerId: 'p2',
    intent: { type: 'EndTurn' },
  });
  assert.equal(endP2.validation.ok, true);

  const endP1 = applyCommand(endP2.state, {
    actorPlayerId: 'p1',
    intent: { type: 'EndTurn' },
  });
  assert.equal(endP1.validation.ok, true);
  assert.equal(endP1.events.some((e) => e.type === 'SuccessorSpawned'), true);
}

// 正常系: 勝敗確定
{
  const initial = createInitialState();
  const p1Soldier = initial.pieces.find((p) => p.owner === 'p1' && p.kind === 'Soldier');
  const p2Ameba = initial.pieces.find((p) => p.owner === 'p2' && p.kind === 'Ameba');
  assert.ok(p1Soldier && p2Ameba);

  const state = {
    ...initial,
    pieces: [
      { ...p1Soldier, position: { x: 2, y: 2 } },
      { ...p2Ameba, position: { x: 3, y: 3 }, currentHp: 1 },
    ],
  };

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: p1Soldier.id, to: { x: 3, y: 3 } },
  });

  assert.equal(result.events.some((event) => event.type === 'GameFinished'), true);
  assert.equal(result.state.status, 'Finished');
  assert.equal(result.state.winner, 'p1');
}

// 異常系: 手番違反
{
  const state = createInitialState();
  const result = applyCommand(state, {
    actorPlayerId: 'p2',
    intent: { type: 'EndTurn' },
  });

  assert.equal(result.validation.ok, false);
  if (!result.validation.ok) {
    assert.equal(result.validation.reason, 'NOT_ACTIVE_PLAYER');
  }
}

// 異常系: 移動距離違反
{
  const state = createInitialState();
  const ameba = state.pieces.find((p) => p.owner === 'p1' && p.kind === 'Ameba');
  assert.ok(ameba);

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: ameba.id, to: { x: 3, y: 3 } },
  });

  assert.equal(result.validation.ok, false);
  if (!result.validation.ok) {
    assert.equal(result.validation.reason, 'INVALID_MOVE_DISTANCE');
  }
}

// 異常系: 重複配置
{
  const state = createInitialState();
  const ameba = state.pieces.find((p) => p.owner === 'p1' && p.kind === 'Ameba');
  const goblin = state.pieces.find((p) => p.owner === 'p1' && p.kind === 'Goblin');
  assert.ok(ameba && goblin);

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: ameba.id, to: goblin.position },
  });

  assert.equal(result.validation.ok, false);
  if (!result.validation.ok) {
    assert.equal(result.validation.reason, 'CELL_OCCUPIED');
  }
}

// 異常系: 終局後操作
{
  const state = {
    ...createInitialState(),
    status: 'Finished',
    winner: 'p1',
  };

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'EndTurn' },
  });

  assert.equal(result.validation.ok, false);
  if (!result.validation.ok) {
    assert.equal(result.validation.reason, 'GAME_ALREADY_FINISHED');
  }
}

// 受け入れ条件: Eventリプレイで同状態復元
{
  const initial = createInitialState();
  const ameba = initial.pieces.find((p) => p.owner === 'p1' && p.kind === 'Ameba');
  assert.ok(ameba);

  const result = applyCommand(initial, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: ameba.id, to: { x: 0, y: 1 } },
  });

  const replayed = result.events.reduce((state, event) => applyEvent(state, event), initial);
  assert.deepEqual(replayed, result.state);
}

console.log('core-unit: ok');
