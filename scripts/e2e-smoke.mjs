import assert from 'node:assert/strict';
import {
  openRoom,
  createWelcomeMessage,
  handleIntentMessage,
  handleResyncRequestMessage,
  handleAdminMessage,
  selectPlayerForConnection,
} from '../packages/backend/dist/index.js';
import {
  createEmptyClientState,
  reduceIncoming,
} from '../packages/frontend/dist/index.js';

let room = openRoom('room-1');
let client = createEmptyClientState();

const welcome = createWelcomeMessage(room, 'p1');
client = reduceIncoming(client, welcome);

assert.equal(client.seq, 0);
assert.equal(client.state?.turn, 1);
assert.equal(client.state?.activePlayer, 'p1');

const accepted = handleIntentMessage(room, {
  type: 'INTENT',
  payload: {
    expectedTurn: 1,
    command: {
      actorPlayerId: 'p1',
      intent: { type: 'EndTurn' },
    },
  },
});

room = accepted.room;
assert.equal(accepted.outbound.length, 1);
assert.equal(accepted.outbound[0].type, 'EVENT');
assert.equal(accepted.outbound[0].payload.seq, 1);

client = reduceIncoming(client, accepted.outbound[0]);
assert.equal(client.seq, 1);
assert.equal(client.state?.turn, 2);
assert.equal(client.state?.activePlayer, 'p2');

const staleTurn = handleIntentMessage(room, {
  type: 'INTENT',
  payload: {
    expectedTurn: 1,
    command: {
      actorPlayerId: 'p1',
      intent: { type: 'EndTurn' },
    },
  },
});

assert.equal(staleTurn.outbound[0].type, 'REJECT');
assert.equal(staleTurn.outbound[0].payload.reason, 'TURN_MISMATCH');

const wrongActor = handleIntentMessage(room, {
  type: 'INTENT',
  payload: {
    expectedTurn: 2,
    command: {
      actorPlayerId: 'p1',
      intent: { type: 'EndTurn' },
    },
  },
});

assert.equal(wrongActor.outbound[0].type, 'REJECT');
assert.equal(wrongActor.outbound[0].payload.reason, 'NOT_ACTIVE_PLAYER');

const clientWithGap = createEmptyClientState();
let recovered = reduceIncoming(clientWithGap, welcome);

// seq=1 のEVENTを意図的に落とす
const accepted2 = handleIntentMessage(room, {
  type: 'INTENT',
  payload: {
    expectedTurn: 2,
    command: {
      actorPlayerId: 'p2',
      intent: { type: 'EndTurn' },
    },
  },
});
room = accepted2.room;

assert.equal(accepted2.outbound[0].type, 'EVENT');
assert.equal(accepted2.outbound[0].payload.seq, 2);

// 欠損があるため適用されない
recovered = reduceIncoming(recovered, accepted2.outbound[0]);
assert.equal(recovered.seq, 0);
assert.equal(recovered.state?.turn, 1);

const sync = handleResyncRequestMessage(room, {
  type: 'RESYNC_REQUEST',
  payload: {
    fromSeq: recovered.seq,
  },
});

assert.equal(sync.outbound.length, 1);
assert.equal(sync.outbound[0].type, 'SYNC');
assert.equal(sync.outbound[0].payload.seq, room.seq);

recovered = reduceIncoming(recovered, sync.outbound[0]);
assert.equal(recovered.seq, 2);
assert.equal(recovered.state?.turn, 3);
assert.equal(recovered.state?.activePlayer, 'p1');

const destroyed = handleAdminMessage(room, {
  type: 'ADMIN',
  payload: {
    action: 'DESTROY_ROOM',
  },
});

assert.equal(destroyed.outbound.length, 0);
assert.equal(destroyed.room.roomId, 'uninitialized');
assert.equal(destroyed.room.seq, 0);
assert.equal(destroyed.room.game.turn, 1);

const joinP1 = selectPlayerForConnection(room, 'p1', new Set());
assert.equal(joinP1.ok, true);
if (joinP1.ok) {
  assert.equal(joinP1.playerId, 'p1');
  assert.equal(joinP1.replacesExisting, false);
}

const joinP2 = selectPlayerForConnection(room, null, new Set(['p1']));
assert.equal(joinP2.ok, true);
if (joinP2.ok) {
  assert.equal(joinP2.playerId, 'p2');
  assert.equal(joinP2.replacesExisting, false);
}

const reconnectP1 = selectPlayerForConnection(room, 'p1', new Set(['p1', 'p2']));
assert.equal(reconnectP1.ok, true);
if (reconnectP1.ok) {
  assert.equal(reconnectP1.playerId, 'p1');
  assert.equal(reconnectP1.replacesExisting, true);
}

const roomFull = selectPlayerForConnection(room, null, new Set(['p1', 'p2']));
assert.equal(roomFull.ok, false);
if (!roomFull.ok) {
  assert.equal(roomFull.reason, 'ROOM_FULL');
}

console.log('e2e-smoke: ok');
