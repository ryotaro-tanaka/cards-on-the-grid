import assert from 'node:assert/strict';
import {
  openRoom,
  createWelcomeMessage,
  handleIntentMessage,
  handleResyncRequestMessage,
  handleAdminMessage,
  confirmSeat,
  startRoom,
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

const beforeStart = handleIntentMessage(room, {
  type: 'INTENT',
  payload: {
    expectedTurn: 1,
    command: {
      actorPlayerId: 'p1',
      intent: { type: 'EndTurn' },
    },
  },
});
assert.equal(beforeStart.outbound[0].type, 'REJECT');
assert.equal(beforeStart.outbound[0].payload.reason, 'PHASE_MISMATCH');

room = startRoom(room, () => 0);

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

const validSeat = confirmSeat(room, 'p1');
assert.equal(validSeat.ok, true);
if (validSeat.ok) {
  assert.equal(validSeat.playerId, 'p1');
}

const invalidSeat = confirmSeat(room, 'p3');
assert.equal(invalidSeat.ok, false);
if (!invalidSeat.ok) {
  assert.equal(invalidSeat.reason, 'INVALID_PLAYER_ID');
}



const randomStartP1 = startRoom(openRoom('room-random-1'), () => 0.1);
assert.equal(randomStartP1.lifecycle, 'started');
assert.equal(randomStartP1.game.activePlayer, 'p1');

const randomStartP2 = startRoom(openRoom('room-random-2'), () => 0.9);
assert.equal(randomStartP2.lifecycle, 'started');
assert.equal(randomStartP2.game.activePlayer, 'p2');

const unchangedAfterStarted = startRoom(randomStartP1, () => 0.9);
assert.equal(unchangedAfterStarted.game.activePlayer, 'p1');

console.log('e2e-smoke: ok');
