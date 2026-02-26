import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../../core/dist/index.js';
import { createEmptyClientState, reduceIncoming, reduceClientState } from '../dist/index.js';

test('reducer: WELCOMEでstateを保持し、MESSAGE_SENTでdebugMessagesに積む', () => {
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

  assert.equal(client.you, 'p1');
  assert.equal(client.state?.turn, base.turn);

  const next = reduceClientState(client, {
    type: 'MESSAGE_SENT',
    payload: { type: 'RESYNC_REQUEST', payload: { fromSeq: 0 } },
  });

  assert.equal(next.debugMessages.at(-1)?.direction, 'client');
  assert.equal(next.debugMessages.at(-1)?.message.type, 'RESYNC_REQUEST');
});
