import assert from 'node:assert/strict';
import {
  applyCommand,
  applyEvent,
  createInitialState,
} from '../packages/core/dist/index.js';

function pieceAt(state, x, y) {
  return state.pieces.find((piece) => piece.position.x === x && piece.position.y === y);
}

// 仕様: 初期配置座標
{
  const state = createInitialState();

  assert.equal(pieceAt(state, 1, 1)?.owner, 'p1');
  assert.equal(pieceAt(state, 3, 1)?.owner, 'p1');
  assert.equal(pieceAt(state, 5, 1)?.owner, 'p1');
  assert.equal(pieceAt(state, 1, 5)?.owner, 'p2');
  assert.equal(pieceAt(state, 3, 5)?.owner, 'p2');
  assert.equal(pieceAt(state, 5, 5)?.owner, 'p2');
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

// 正常系: 移動後の前方1マスへの自動戦闘（依頼ケース同等）
{
  const initial = createInitialState();
  const p2Ameba = initial.pieces.find((p) => p.owner === 'p2' && p.kind === 'Ameba');
  const p1Goblin = initial.pieces.find((p) => p.owner === 'p1' && p.kind === 'Goblin');
  assert.ok(p2Ameba && p1Goblin);

  const state = {
    ...initial,
    activePlayer: 'p2',
    pieces: initial.pieces.map((piece) => {
      if (piece.id === p2Ameba.id) return { ...piece, position: { x: 3, y: 4 } };
      if (piece.id === p1Goblin.id) return { ...piece, position: { x: 3, y: 2 }, currentHp: 2 };
      return piece;
    }),
    turnState: { movedPieceIds: [] },
  };

  const result = applyCommand(state, {
    actorPlayerId: 'p2',
    intent: { type: 'Move', pieceId: p2Ameba.id, to: { x: 3, y: 3 } },
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.events[0].type, 'PieceMoved');
  assert.equal(result.events[1].type, 'CombatResolved');
  assert.equal(result.events.length, 2);
  assert.equal(result.state.pieces.find((p) => p.id === p1Goblin.id)?.currentHp, 1);
}

// 正常系: Lancer は前方2マスを同時攻撃
{
  const initial = createInitialState({
    creaturesByPlayer: {
      p1: ['Lancer', 'Ameba', 'Soldier'],
      p2: ['Ameba', 'Goblin', 'Soldier'],
    },
  });

  const p1Lancer = initial.pieces.find((p) => p.owner === 'p1' && p.kind === 'Lancer');
  const p2Ameba = initial.pieces.find((p) => p.owner === 'p2' && p.kind === 'Ameba');
  const p2Goblin = initial.pieces.find((p) => p.owner === 'p2' && p.kind === 'Goblin');
  assert.ok(p1Lancer && p2Ameba && p2Goblin);

  const state = {
    ...initial,
    pieces: initial.pieces.map((piece) => {
      if (piece.id === p1Lancer.id) return { ...piece, position: { x: 3, y: 2 } };
      if (piece.id === p2Ameba.id) return { ...piece, position: { x: 3, y: 4 }, currentHp: 1 };
      if (piece.id === p2Goblin.id) return { ...piece, position: { x: 3, y: 5 }, currentHp: 2 };
      return piece;
    }),
  };

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: p1Lancer.id, to: { x: 3, y: 3 } },
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.events[0].type, 'PieceMoved');
  assert.equal(result.events.filter((e) => e.type === 'CombatResolved').length, 2);
  assert.equal(result.state.pieces.find((p) => p.id === p2Ameba.id), undefined);
  assert.equal(result.state.pieces.find((p) => p.id === p2Goblin.id)?.currentHp, 1);
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
    intent: { type: 'Move', pieceId: p1Soldier.id, to: { x: 3, y: 2 } },
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

// 正常系: 勝敗確定（相手死守陣地への侵入）
{
  const initial = createInitialState();
  const p1Soldier = initial.pieces.find((p) => p.owner === 'p1' && p.kind === 'Soldier');
  assert.ok(p1Soldier);

  const state = {
    ...initial,
    pieces: [{ ...p1Soldier, position: { x: 2, y: 5 } }],
  };

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: p1Soldier.id, to: { x: 2, y: 6 } },
  });

  assert.equal(result.events.some((event) => event.type === 'GameFinished'), true);
  assert.equal(result.state.status, 'Finished');
  assert.equal(result.state.winner, 'p1');
}

// 正常系: 相手陣地（非死守）侵入では終局しない
{
  const initial = createInitialState();
  const p1Soldier = initial.pieces.find((p) => p.owner === 'p1' && p.kind === 'Soldier');
  assert.ok(p1Soldier);

  const state = {
    ...initial,
    pieces: [{ ...p1Soldier, position: { x: 2, y: 4 } }],
  };

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: p1Soldier.id, to: { x: 2, y: 5 } },
  });

  assert.equal(result.events.some((event) => event.type === 'GameFinished'), false);
  assert.equal(result.state.status, 'InProgress');
}

// 正常系: 相手盤面0体だけでは終局しない
{
  const initial = createInitialState();
  const p1Soldier = initial.pieces.find((p) => p.owner === 'p1' && p.kind === 'Soldier');
  assert.ok(p1Soldier);

  const state = {
    ...initial,
    pieces: [{ ...p1Soldier, position: { x: 2, y: 2 } }],
  };

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: p1Soldier.id, to: { x: 2, y: 3 } },
  });

  assert.equal(result.events.some((event) => event.type === 'GameFinished'), false);
  assert.equal(result.state.status, 'InProgress');
  assert.equal(result.state.winner, null);
}

// 正常系: 補充召喚は死守陣地を除く自陣地のみ
{
  const initial = createInitialState();
  const state = {
    ...initial,
    pieces: initial.pieces.filter((piece) => piece.owner === 'p1'),
    pendingSuccessors: [
      {
        id: 'pending-p2',
        owner: 'p2',
        kind: 'Ameba',
        stats: { maxHp: 1, attack: 1, successorCost: 1 },
        turnsRemaining: 1,
      },
    ],
    activePlayer: 'p1',
    turnState: { movedPieceIds: [] },
  };

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'EndTurn' },
  });

  const spawned = result.events.find((event) => event.type === 'SuccessorSpawned');
  assert.ok(spawned);
  if (spawned.type === 'SuccessorSpawned') {
    assert.notEqual(spawned.piece.position.y, 6);
    assert.equal([5, 4].includes(spawned.piece.position.y), true);
  }
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


// 異常系: 敵マスへの移動も禁止（重複配置）
{
  const initial = createInitialState();
  const ameba = initial.pieces.find((p) => p.owner === 'p1' && p.kind === 'Ameba');
  const enemy = initial.pieces.find((p) => p.owner === 'p2' && p.kind === 'Ameba');
  assert.ok(ameba && enemy);

  const state = {
    ...initial,
    pieces: initial.pieces.map((piece) => {
      if (piece.id === ameba.id) return { ...piece, position: { x: 2, y: 2 } };
      if (piece.id === enemy.id) return { ...piece, position: { x: 3, y: 3 } };
      return piece;
    }),
  };

  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: ameba.id, to: { x: 3, y: 3 } },
  });

  assert.equal(result.validation.ok, false);
  if (!result.validation.ok) {
    assert.equal(result.validation.reason, 'CELL_OCCUPIED');
  }
}
// 異常系: 重複配置
{
  const initial = createInitialState();
  const state = {
    ...initial,
    pieces: initial.pieces.map((piece) =>
      piece.owner === 'p1' && piece.kind === 'Goblin'
        ? { ...piece, position: { x: 2, y: 1 } }
        : piece,
    ),
  };
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

// 正常系: 初期手札3枚配布
{
  const state = createInitialState({ rngSeed: 1n });
  assert.equal(state.hands.p1.length, 3);
  assert.equal(state.hands.p2.length, 3);
}

// 正常系: EndTurnで次プレイヤーが1枚ドロー
{
  const state = createInitialState({ rngSeed: 1n });
  const result = applyCommand(state, {
    actorPlayerId: 'p1',
    intent: { type: 'EndTurn' },
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.events.some((event) => event.type === 'CardDrawn'), true);
  assert.equal(result.state.hands.p2.length, 4);
}

// 正常系: UseCardで手札からカードが消費される
{
  const state = createInitialState({ rngSeed: 1n });
  const card = state.hands.p1[0];
  assert.ok(card);

  const cardState = {
    ...state,
    hands: {
      ...state.hands,
      p1: [{ id: card.id, kind: 'Doping' }],
    },
  };
  const targetPiece = cardState.pieces.find((piece) => piece.owner === 'p1');
  assert.ok(targetPiece);

  const result = applyCommand(cardState, {
    actorPlayerId: 'p1',
    intent: {
      type: 'UseCard',
      cardId: card.id,
      cardKind: 'Doping',
      pieceId: targetPiece.id,
    },
  });

  assert.equal(result.validation.ok, true);
  assert.equal(result.events[0].type, 'CardUsed');
  assert.equal(result.state.hands.p1.length, 0);
}



// 正常系: カードMoveは攻撃なし
{
  const state = createInitialState({ rngSeed: 1n });
  const piece = state.pieces.find((p) => p.owner === 'p1');
  const enemy = state.pieces.find((p) => p.owner === 'p2');
  assert.ok(piece && enemy);

  const arranged = {
    ...state,
    pieces: state.pieces.map((p) => {
      if (p.id === piece.id) return { ...p, position: { x: 3, y: 2 } };
      if (p.id === enemy.id) return { ...p, position: { x: 3, y: 4 } };
      return p;
    }),
    hands: { ...state.hands, p1: [{ id: 'c_move', kind: 'Move' }] },
  };

  const result = applyCommand(arranged, {
    actorPlayerId: 'p1',
    intent: { type: 'UseCard', cardId: 'c_move', cardKind: 'Move', pieceId: piece.id, to: { x: 3, y: 3 } },
  });

  assert.equal(result.events.some((e) => e.type === 'CombatResolved'), false);
}

// 正常系: Assaultは移動＋攻撃あり
{
  const state = createInitialState({ rngSeed: 1n });
  const piece = state.pieces.find((p) => p.owner === 'p1');
  const enemy = state.pieces.find((p) => p.owner === 'p2');
  assert.ok(piece && enemy);

  const arranged = {
    ...state,
    pieces: state.pieces.map((p) => {
      if (p.id === piece.id) return { ...p, position: { x: 3, y: 2 }, stats: { ...p.stats, attack: 1 } };
      if (p.id === enemy.id) return { ...p, position: { x: 3, y: 4 }, currentHp: 2 };
      return p;
    }),
    hands: { ...state.hands, p1: [{ id: 'c_assault', kind: 'Assault' }] },
  };

  const result = applyCommand(arranged, {
    actorPlayerId: 'p1',
    intent: { type: 'UseCard', cardId: 'c_assault', cardKind: 'Assault', pieceId: piece.id, to: { x: 3, y: 3 } },
  });

  assert.equal(result.events.some((e) => e.type === 'CombatResolved'), true);
}

// 正常系: ダメージカードで死亡処理（補充キュー）
{
  const state = createInitialState({ rngSeed: 1n });
  const enemy = state.pieces.find((p) => p.owner === 'p2');
  assert.ok(enemy);

  const arranged = {
    ...state,
    pieces: state.pieces.map((p) => (p.id === enemy.id ? { ...p, currentHp: 1 } : p)),
    hands: { ...state.hands, p1: [{ id: 'c_arrow', kind: 'Arrowrain' }] },
  };

  const result = applyCommand(arranged, {
    actorPlayerId: 'p1',
    intent: { type: 'UseCard', cardId: 'c_arrow', cardKind: 'Arrowrain', targetPieceId: enemy.id },
  });

  assert.equal(result.state.pieces.some((p) => p.id === enemy.id), false);
  assert.equal(result.state.pendingSuccessors.length > 0, true);
}

// 正常系: バフカード適用
{
  const state = createInitialState({ rngSeed: 1n });
  const own = state.pieces.find((p) => p.owner === 'p1');
  assert.ok(own);

  const arranged = {
    ...state,
    hands: { ...state.hands, p1: [{ id: 'c_breath', kind: 'Breath' }] },
  };

  const result = applyCommand(arranged, {
    actorPlayerId: 'p1',
    intent: { type: 'UseCard', cardId: 'c_breath', cardKind: 'Breath', pieceId: own.id },
  });

  const buffed = result.state.pieces.find((p) => p.id === own.id);
  assert.ok(buffed);
  assert.equal(buffed.stats.attack, own.stats.attack + 1);
  assert.equal(buffed.stats.maxHp, own.stats.maxHp + 1);
}

// 正常系: Mine踏破でダメージと除去
{
  const state = createInitialState({ rngSeed: 1n });
  const own = state.pieces.find((p) => p.owner === 'p1');
  assert.ok(own);

  const arranged = {
    ...state,
    pieces: state.pieces.map((p) => (p.id === own.id ? { ...p, position: { x: 2, y: 2 }, currentHp: 2 } : p)),
    mines: [{ owner: 'p2', position: { x: 2, y: 3 } }],
  };

  const result = applyCommand(arranged, {
    actorPlayerId: 'p1',
    intent: { type: 'Move', pieceId: own.id, to: { x: 2, y: 3 } },
  });

  const moved = result.state.pieces.find((p) => p.id === own.id);
  assert.ok(moved);
  assert.equal(moved.currentHp, 1);
  assert.equal(result.state.mines.length, 0);
}

// 正常系: Stealingは相手手札から1枚奪取
{
  const state = createInitialState({ rngSeed: 1n });
  const arranged = {
    ...state,
    hands: {
      ...state.hands,
      p1: [{ id: 'c_steal', kind: 'Stealing' }],
      p2: [{ id: 'c_t1', kind: 'Barrier' }, { id: 'c_t2', kind: 'Mine' }],
    },
  };

  const result = applyCommand(arranged, {
    actorPlayerId: 'p1',
    intent: { type: 'UseCard', cardId: 'c_steal', cardKind: 'Stealing', targetPlayerId: 'p2' },
  });

  assert.equal(result.events.some((e) => e.type === 'CardStolen'), true);
  assert.equal(result.state.hands.p2.length, 1);
  assert.equal(result.state.hands.p1.length, 1);
}

console.log('core-unit: ok');

// フェーズ5: 各カード成功ケースを最低1件ずつ
{
  const base = createInitialState({ rngSeed: 7n });
  const own = base.pieces.find((p) => p.owner === 'p1');
  const enemy = base.pieces.find((p) => p.owner === 'p2');
  assert.ok(own && enemy);

  const cases = [
    { kind: 'Move', intent: { type: 'UseCard', cardId: 'c1', cardKind: 'Move', pieceId: own.id, to: { x: 2, y: 1 } } },
    { kind: 'Assault', intent: { type: 'UseCard', cardId: 'c2', cardKind: 'Assault', pieceId: own.id, to: { x: 2, y: 1 } } },
    { kind: 'Arrowrain', intent: { type: 'UseCard', cardId: 'c3', cardKind: 'Arrowrain', targetPieceId: enemy.id } },
    { kind: 'Rock Bombardment', intent: { type: 'UseCard', cardId: 'c4', cardKind: 'Rock Bombardment', targetPieceId: enemy.id } },
    { kind: 'Lightning', intent: { type: 'UseCard', cardId: 'c5', cardKind: 'Lightning', targetPieceId: enemy.id } },
    { kind: 'Recharge', intent: { type: 'UseCard', cardId: 'c6', cardKind: 'Recharge', pieceId: own.id } },
    { kind: 'Doping', intent: { type: 'UseCard', cardId: 'c7', cardKind: 'Doping', pieceId: own.id } },
    { kind: 'Barrier', intent: { type: 'UseCard', cardId: 'c8', cardKind: 'Barrier', pieceId: own.id } },
    { kind: 'Breath', intent: { type: 'UseCard', cardId: 'c9', cardKind: 'Breath', pieceId: own.id } },
    { kind: 'Mine', intent: { type: 'UseCard', cardId: 'c10', cardKind: 'Mine', to: { x: 0, y: 1 } } },
    { kind: 'Stealing', intent: { type: 'UseCard', cardId: 'c11', cardKind: 'Stealing', targetPlayerId: 'p2' } },
  ];

  for (const c of cases) {
    const state = {
      ...base,
      pieces: base.pieces.map((p) => {
        if (p.id === own.id) {
          return { ...p, kind: c.kind === 'Recharge' ? 'Ninja' : p.kind, activeSkillUsed: c.kind === 'Recharge' };
        }
        if (p.id === enemy.id) {
          if (c.kind === 'Rock Bombardment') return { ...p, position: { x: 3, y: 2 }, currentHp: 3 };
          if (c.kind === 'Lightning') return { ...p, position: { x: 3, y: 4 }, currentHp: 3 };
          return { ...p, currentHp: 3 };
        }
        return p;
      }),
      hands: {
        ...base.hands,
        p1: [{ id: `card_${c.kind}`, kind: c.kind }],
        p2: c.kind === 'Stealing' ? [{ id: 'enemy-card', kind: 'Barrier' }] : base.hands.p2,
      },
    };

    const result = applyCommand(state, {
      actorPlayerId: 'p1',
      intent: { ...c.intent, cardId: `card_${c.kind}` },
    });

    assert.equal(result.validation.ok, true, `${c.kind} should be valid`);
  }
}

// フェーズ5: 各カード失敗ケース（不正対象/範囲外/非手番）
{
  const base = createInitialState({ rngSeed: 9n });
  const own = base.pieces.find((p) => p.owner === 'p1');
  const enemy = base.pieces.find((p) => p.owner === 'p2');
  assert.ok(own && enemy);

  const invalidCases = [
    { kind: 'Move', intent: { type: 'UseCard', cardId: 'bad1', cardKind: 'Move', pieceId: own.id, to: { x: 9, y: 9 } } },
    { kind: 'Assault', intent: { type: 'UseCard', cardId: 'bad2', cardKind: 'Assault', pieceId: own.id, to: own.position } },
    { kind: 'Arrowrain', intent: { type: 'UseCard', cardId: 'bad3', cardKind: 'Arrowrain', targetPieceId: own.id } },
    { kind: 'Rock Bombardment', intent: { type: 'UseCard', cardId: 'bad4', cardKind: 'Rock Bombardment', targetPieceId: own.id } },
    { kind: 'Lightning', intent: { type: 'UseCard', cardId: 'bad5', cardKind: 'Lightning', targetPieceId: own.id } },
    { kind: 'Recharge', intent: { type: 'UseCard', cardId: 'bad6', cardKind: 'Recharge', pieceId: own.id } },
    { kind: 'Doping', intent: { type: 'UseCard', cardId: 'bad7', cardKind: 'Doping', pieceId: enemy.id } },
    { kind: 'Barrier', intent: { type: 'UseCard', cardId: 'bad8', cardKind: 'Barrier', pieceId: enemy.id } },
    { kind: 'Breath', intent: { type: 'UseCard', cardId: 'bad9', cardKind: 'Breath', pieceId: enemy.id } },
    { kind: 'Mine', intent: { type: 'UseCard', cardId: 'bad10', cardKind: 'Mine', to: { x: 0, y: 0 } } },
    { kind: 'Stealing', intent: { type: 'UseCard', cardId: 'bad11', cardKind: 'Stealing', targetPlayerId: 'p2' } },
  ];

  for (const c of invalidCases) {
    const state = {
      ...base,
      hands: {
        ...base.hands,
        p1: [{ id: `card_${c.kind}`, kind: c.kind }],
        p2: c.kind === 'Stealing' ? [] : base.hands.p2,
      },
      pieces: base.pieces.map((p) => (c.kind === 'Recharge' && p.id === own.id ? { ...p, activeSkillUsed: false } : p)),
    };

    const result = applyCommand(state, {
      actorPlayerId: 'p1',
      intent: { ...c.intent, cardId: `card_${c.kind}` },
    });

    assert.equal(result.validation.ok, false, `${c.kind} should be invalid`);
  }

  const notActive = applyCommand(base, {
    actorPlayerId: 'p2',
    intent: { type: 'UseCard', cardId: 'x', cardKind: 'Mine', to: { x: 0, y: 5 } },
  });
  assert.equal(notActive.validation.ok, false);
  if (!notActive.validation.ok) {
    assert.equal(notActive.validation.reason, 'NOT_ACTIVE_PLAYER');
  }
}

// フェーズ5: RNGシード固定で再現可能
{
  const a = createInitialState({ rngSeed: 1234n });
  const b = createInitialState({ rngSeed: 1234n });
  const c = createInitialState({ rngSeed: 1235n });

  assert.deepEqual(a.hands, b.hands);
  assert.notDeepEqual(a.hands, c.hands);
}
