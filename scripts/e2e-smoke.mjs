import assert from 'node:assert/strict';
import {
  openRoom,
  createWelcomeMessage,
  handleIntentMessage,
  handleResyncRequestMessage,
  handleAdminMessage,
  confirmSeat,
  startRoom,
  planResync,
  REJECT_REASONS,
} from '../packages/backend/dist/index.js';
import { RoomDO } from '../packages/backend/dist/worker.js';
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

assert.deepEqual(REJECT_REASONS, [
  'TURN_MISMATCH',
  'NOT_ACTIVE_PLAYER',
  'PIECE_NOT_FOUND',
  'PIECE_NOT_OWNED_BY_ACTOR',
  'OUT_OF_BOUNDS',
  'GAME_ALREADY_FINISHED',
  'PHASE_MISMATCH',
  'INVALID_MOVE_DISTANCE',
  'SAME_POSITION',
  'CELL_OCCUPIED',
  'MOVE_ALREADY_USED_THIS_TURN',
  'ROOM_FULL',
  'SEAT_UNASSIGNED',
  'INVALID_PLAYER_ID',
]);

const beforeStart = handleIntentMessage(room, 'p1', {
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

const accepted = handleIntentMessage(room, 'p1', {
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

const staleTurn = handleIntentMessage(room, 'p1', {
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

const wrongActor = handleIntentMessage(room, 'p2', {
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
assert.equal(wrongActor.outbound[0].payload.reason, 'INVALID_PLAYER_ID');
assert.equal(wrongActor.room.seq, room.seq);


const wrongActorAndTurn = handleIntentMessage(room, 'p2', {
  type: 'INTENT',
  payload: {
    expectedTurn: 1,
    command: {
      actorPlayerId: 'p1',
      intent: { type: 'EndTurn' },
    },
  },
});
assert.equal(wrongActorAndTurn.outbound[0].type, 'REJECT');
assert.equal(wrongActorAndTurn.outbound[0].payload.reason, 'INVALID_PLAYER_ID');
assert.equal(wrongActorAndTurn.room.seq, room.seq);

const clientWithGap = createEmptyClientState();
let recovered = reduceIncoming(clientWithGap, welcome);

// seq=1 のEVENTを意図的に落とす
const accepted2 = handleIntentMessage(room, 'p2', {
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

assert.equal(sync.outbound.length, 2);
assert.equal(sync.outbound[0].type, 'EVENT');
assert.equal(sync.outbound[1].type, 'EVENT');

recovered = reduceIncoming(recovered, sync.outbound[0]);
recovered = reduceIncoming(recovered, sync.outbound[1]);
assert.equal(recovered.seq, 2);
assert.equal(recovered.state?.turn, 3);
assert.equal(recovered.state?.activePlayer, 'p1');




const partialReplayPlan = planResync(room, 1);
assert.equal(partialReplayPlan.mode, 'events');
if (partialReplayPlan.mode === 'events') {
  assert.equal(partialReplayPlan.events.length, 1);
  assert.equal(partialReplayPlan.events[0].seq, 2);
}

const aheadSeqPlan = planResync(room, 999);
assert.equal(aheadSeqPlan.mode, 'snapshot');

const snapshotFallbackRoom = {
  ...room,
  seq: 120,
  eventLog: [
    {
      seq: 100,
      event: {
        type: 'TurnEnded',
        nextTurn: {
          owner: 'p1',
          turnNo: 100,
        },
      },
    },
  ],
};

const snapshotFallback = handleResyncRequestMessage(snapshotFallbackRoom, {
  type: 'RESYNC_REQUEST',
  payload: {
    fromSeq: 1,
  },
});
assert.equal(snapshotFallback.outbound.length, 1);
assert.equal(snapshotFallback.outbound[0].type, 'SYNC');
assert.equal(snapshotFallback.outbound[0].payload.seq, 120);


const upToDateResync = handleResyncRequestMessage(room, {
  type: 'RESYNC_REQUEST',
  payload: {
    fromSeq: room.seq,
  },
});
assert.equal(upToDateResync.outbound.length, 0);

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



class FakeSocket {
  constructor() {
    this.accepted = false;
    this.sent = [];
    this.closed = null;
    this.listeners = new Map();
  }

  accept() {
    this.accepted = true;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  close(code, reason) {
    this.closed = { code, reason };
    const closeHandlers = this.listeners.get('close') ?? [];
    for (const handler of closeHandlers) {
      handler({});
    }
  }

  emit(type, payload) {
    const handlers = this.listeners.get(type) ?? [];
    for (const handler of handlers) {
      handler(payload);
    }
  }

  emitJson(message) {
    this.emit('message', { data: JSON.stringify(message) });
  }
}

const roomDo = new RoomDO();
roomDo.room = openRoom('room-integration');

const s1 = new FakeSocket();
const s2 = new FakeSocket();
const s3 = new FakeSocket();

roomDo.handleConnection(s1);
roomDo.handleConnection(s2);
roomDo.handleConnection(s3);

s1.emitJson({
  type: 'INTENT',
  payload: {
    expectedTurn: 1,
    command: {
      actorPlayerId: 'p1',
      intent: { type: 'EndTurn' },
    },
  },
});
assert.equal(s1.sent.at(-1).type, 'REJECT');
assert.equal(s1.sent.at(-1).payload.reason, 'SEAT_UNASSIGNED');

const originalRandom = Math.random;
Math.random = () => 0;

s1.emitJson({ type: 'HELLO', payload: { playerId: 'p1' } });
assert.equal(s1.sent.at(-1).type, 'WELCOME');
assert.equal(s1.sent.at(-1).payload.roomStatus, 'waiting');

s2.emitJson({ type: 'HELLO', payload: { playerId: 'p2' } });
assert.equal(s1.sent.at(-1).type, 'WELCOME');
assert.equal(s1.sent.at(-1).payload.roomStatus, 'started');
assert.equal(s2.sent.at(-1).type, 'WELCOME');
assert.equal(s2.sent.at(-1).payload.roomStatus, 'started');
assert.equal(s2.sent.at(-1).payload.state.activePlayer, 'p1');

Math.random = originalRandom;

s3.emitJson({ type: 'HELLO', payload: { playerId: 'p3' } });
assert.equal(s3.sent.at(-1).type, 'REJECT');
assert.equal(s3.sent.at(-1).payload.reason, 'INVALID_PLAYER_ID');

s1.emitJson({
  type: 'INTENT',
  payload: {
    expectedTurn: 1,
    command: {
      actorPlayerId: 'p1',
      intent: { type: 'EndTurn' },
    },
  },
});
assert.equal(s1.sent.at(-1).type, 'EVENT');
assert.equal(s1.sent.at(-1).payload.seq, 1);
assert.equal(s2.sent.at(-1).type, 'EVENT');
assert.equal(s2.sent.at(-1).payload.seq, 1);

s2.emitJson({
  type: 'INTENT',
  payload: {
    expectedTurn: 2,
    command: {
      actorPlayerId: 'p2',
      intent: { type: 'EndTurn' },
    },
  },
});
assert.equal(s1.sent.at(-1).type, 'EVENT');
assert.equal(s1.sent.at(-1).payload.seq, 2);

const s1Reconnect = new FakeSocket();
roomDo.handleConnection(s1Reconnect);
s1Reconnect.emitJson({ type: 'HELLO', payload: { playerId: 'p1' } });
assert.equal(s1Reconnect.sent.at(-1).type, 'WELCOME');
assert.equal(s1Reconnect.sent.at(-1).payload.seq, 2);

s1Reconnect.emitJson({
  type: 'RESYNC_REQUEST',
  payload: {
    fromSeq: 1,
  },
});
assert.equal(s1Reconnect.sent.at(-1).type, 'EVENT');
assert.equal(s1Reconnect.sent.at(-1).payload.seq, 2);

s1Reconnect.emitJson({
  type: 'RESYNC_REQUEST',
  payload: {
    fromSeq: 999,
  },
});
assert.equal(s1Reconnect.sent.at(-1).type, 'SYNC');
assert.equal(s1Reconnect.sent.at(-1).payload.seq, 2);

console.log('e2e-smoke: ok');
