import assert from 'node:assert/strict';
import {
  openRoom,
  createWelcomeMessage,
  handleIntentMessage,
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

console.log('e2e-smoke: ok');
