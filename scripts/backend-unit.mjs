import assert from 'node:assert/strict';
import { openRoom, startRoom, handleIntentMessage, handleResyncRequestMessage, createWelcomeMessage } from '../packages/backend/dist/index.js';

let room = startRoom(openRoom('room-backend'), () => 0.1);
let seqBeforeCardIntent = room.seq;

// 再接続時の秘匿情報マスク（相手手札）
{
  const welcomeP1 = createWelcomeMessage(room, 'p1');
  assert.equal(Array.isArray(welcomeP1.payload.state.hands.p2), true);
  assert.equal(welcomeP1.payload.state.hands.p2.length, 0);
  assert.equal(welcomeP1.payload.state.hands.p1.length > 0, true);
}

// 2クライアント連続操作時の順序保証（seq単調増加）
{
  const p1Card = room.game.hands.p1[0];
  assert.ok(p1Card);

  if (p1Card.kind !== 'Mine') {
    room = {
      ...room,
      game: {
        ...room.game,
        hands: {
          ...room.game.hands,
          p1: [{ id: 'c_mine_test', kind: 'Mine' }, ...room.game.hands.p1],
        },
      },
    };
  }

  seqBeforeCardIntent = room.seq;
  const playMine = handleIntentMessage(room, 'p1', {
    type: 'INTENT',
    payload: {
      expectedTurn: room.game.turn,
      command: {
        actorPlayerId: 'p1',
        intent: { type: 'UseCard', cardId: room.game.hands.p1[0].id, cardKind: 'Mine', to: { x: 0, y: 1 } },
      },
    },
  });
  room = playMine.room;

  assert.equal(playMine.outbound.length, 2);
  assert.equal(playMine.outbound[0].type, 'EVENT');
  assert.equal(playMine.outbound[1].type, 'EVENT');
  assert.equal(playMine.outbound[0].payload.seq + 1, playMine.outbound[1].payload.seq);

  const endTurn = handleIntentMessage(room, 'p1', {
    type: 'INTENT',
    payload: {
      expectedTurn: room.game.turn,
      command: {
        actorPlayerId: 'p1',
        intent: { type: 'EndTurn' },
      },
    },
  });

  assert.equal(endTurn.outbound[0].payload.seq, playMine.outbound[1].payload.seq + 1);
  room = endTurn.room;
}

// カードイベントを含む欠損復帰
{
  const fromSeq = seqBeforeCardIntent;
  const resync = handleResyncRequestMessage(
    room,
    {
      type: 'RESYNC_REQUEST',
      payload: { fromSeq },
    },
    'p2',
  );

  assert.equal(resync.outbound.length >= 2, true);
  assert.equal(resync.outbound.every((m) => m.type === 'EVENT'), true);

  const hasCardEvent = resync.outbound.some((m) =>
    m.type === 'EVENT' && ['CardUsed', 'MinePlaced'].includes(m.payload.event.type),
  );
  assert.equal(hasCardEvent, true);
}

// 履歴不足時SYNCにもマスク適用
{
  const snapshotRoom = {
    ...room,
    seq: 120,
    eventLog: [
      {
        seq: 100,
        event: {
          type: 'TurnEnded',
          nextTurn: { owner: 'p1', turnNo: 100 },
        },
      },
    ],
  };

  const resync = handleResyncRequestMessage(
    snapshotRoom,
    {
      type: 'RESYNC_REQUEST',
      payload: { fromSeq: 1 },
    },
    'p1',
  );

  assert.equal(resync.outbound.length, 1);
  assert.equal(resync.outbound[0].type, 'SYNC');
  if (resync.outbound[0].type === 'SYNC') {
    assert.equal(resync.outbound[0].payload.state.hands.p2.length, 0);
  }
}

console.log('backend-unit: ok');

// フェーズ5: UseCard 正常系/異常系(REJECT)
{
  let cardRoom = startRoom(openRoom('room-backend-phase5'), () => 0.1);
  cardRoom = {
    ...cardRoom,
    game: {
      ...cardRoom.game,
      hands: {
        ...cardRoom.game.hands,
        p1: [{ id: 'card_ok', kind: 'Mine' }],
      },
    },
  };

  const ok = handleIntentMessage(cardRoom, 'p1', {
    type: 'INTENT',
    payload: {
      expectedTurn: cardRoom.game.turn,
      command: {
        actorPlayerId: 'p1',
        intent: { type: 'UseCard', cardId: 'card_ok', cardKind: 'Mine', to: { x: 0, y: 1 } },
      },
    },
  });

  assert.equal(ok.outbound.some((m) => m.type === 'EVENT' && m.payload.event.type === 'CardUsed'), true);

  const ng = handleIntentMessage(ok.room, 'p1', {
    type: 'INTENT',
    payload: {
      expectedTurn: ok.room.game.turn,
      command: {
        actorPlayerId: 'p1',
        intent: { type: 'UseCard', cardId: 'missing', cardKind: 'Mine', to: { x: 0, y: 1 } },
      },
    },
  });

  assert.equal(ng.outbound[0].type, 'REJECT');
  if (ng.outbound[0].type === 'REJECT') {
    assert.equal(ng.outbound[0].payload.reason, 'CARD_NOT_FOUND_IN_HAND');
  }
}

// フェーズ5: SYNC後にカード状態一致
{
  let syncRoom = startRoom(openRoom('room-backend-sync'), () => 0.1);
  syncRoom = {
    ...syncRoom,
    game: {
      ...syncRoom.game,
      hands: {
        ...syncRoom.game.hands,
        p1: [{ id: 'card_sync', kind: 'Mine' }],
      },
    },
  };

  const used = handleIntentMessage(syncRoom, 'p1', {
    type: 'INTENT',
    payload: {
      expectedTurn: syncRoom.game.turn,
      command: {
        actorPlayerId: 'p1',
        intent: { type: 'UseCard', cardId: 'card_sync', cardKind: 'Mine', to: { x: 1, y: 1 } },
      },
    },
  });
  syncRoom = used.room;

  const forcedSnapshot = {
    ...syncRoom,
    seq: syncRoom.seq,
    eventLog: [
      {
        seq: syncRoom.seq,
        event: { type: 'TurnEnded', nextTurn: { owner: 'p1', turnNo: syncRoom.game.turn } },
      },
    ],
  };

  const sync = handleResyncRequestMessage(
    forcedSnapshot,
    { type: 'RESYNC_REQUEST', payload: { fromSeq: 0 } },
    'p1',
  );

  assert.equal(sync.outbound.length, 1);
  assert.equal(sync.outbound[0].type, 'SYNC');
  if (sync.outbound[0].type === 'SYNC') {
    assert.deepEqual(sync.outbound[0].payload.state.mines, forcedSnapshot.game.mines);
    assert.deepEqual(sync.outbound[0].payload.state.hands.p1, forcedSnapshot.game.hands.p1);
  }
}
