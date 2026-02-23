import type { CardInstance, CardKind, Event, PlayerId, RngState } from './types.js';

const UINT64_MASK = (1n << 64n) - 1n;
const LCG_MULTIPLIER = 6364136223846793005n;
const LCG_INCREMENT = 1442695040888963407n;

const CARD_WEIGHT: Record<CardKind, number> = {
  Move: 1,
  Assault: 5,
  Arrowrain: 1,
  'Rock Bombardment': 2,
  Lightning: 5,
  Recharge: 3,
  Doping: 3,
  Barrier: 3,
  Breath: 4,
  Mine: 2,
  Stealing: 4,
};

const CARD_DRAW_TICKETS: [CardKind, number][] = (Object.entries(CARD_WEIGHT) as [CardKind, number][]).map(([kind, w]) => [
  kind,
  Math.floor(60 / w),
]);

const TOTAL_TICKETS = CARD_DRAW_TICKETS.reduce((sum, [, tickets]) => sum + tickets, 0);

export function createRngState(seed: bigint): RngState {
  const normalized = seed & UINT64_MASK;
  return {
    seed: normalized,
    state: normalized,
    nextCardInstanceNo: 1,
  };
}

export function nextUint64(rngState: RngState): { rngState: RngState; value: bigint } {
  const next = (rngState.state * LCG_MULTIPLIER + LCG_INCREMENT) & UINT64_MASK;
  return {
    rngState: {
      ...rngState,
      state: next,
    },
    value: next,
  };
}

export function drawWeightedCard(rngState: RngState): { rngState: RngState; card: CardInstance } {
  const roll = nextUint64(rngState);
  const picked = Number(roll.value % BigInt(TOTAL_TICKETS));

  let cursor = 0;
  let chosen: CardKind = 'Move';
  for (const [kind, tickets] of CARD_DRAW_TICKETS) {
    cursor += tickets;
    if (picked < cursor) {
      chosen = kind;
      break;
    }
  }

  return {
    rngState: {
      ...roll.rngState,
      nextCardInstanceNo: roll.rngState.nextCardInstanceNo + 1,
    },
    card: {
      id: `c_${roll.rngState.nextCardInstanceNo}`,
      kind: chosen,
    },
  };
}

export function buildDrawEvents(
  playerId: PlayerId,
  handBefore: CardInstance[],
  rngState: RngState,
): { events: Event[]; rngState: RngState } {
  let nextRngState = rngState;
  const events: Event[] = [];

  if (handBefore.length >= 5) {
    const discardRoll = nextUint64(nextRngState);
    nextRngState = discardRoll.rngState;
    const discardedIndex = Number(discardRoll.value % BigInt(handBefore.length));
    const discardedCard = handBefore[discardedIndex];

    events.push({
      type: 'CardDiscardedForDrawLimit',
      playerId,
      discardedCardId: discardedCard.id,
    });
  }

  const drawResult = drawWeightedCard(nextRngState);
  nextRngState = drawResult.rngState;

  events.push({
    type: 'CardDrawn',
    playerId,
    card: drawResult.card,
  });

  return {
    events,
    rngState: nextRngState,
  };
}


export function rollIndex(rngState: RngState, length: number): { rngState: RngState; index: number } {
  if (length <= 0) {
    throw new Error('rollIndex requires length > 0');
  }

  const rolled = nextUint64(rngState);
  return {
    rngState: rolled.rngState,
    index: Number(rolled.value % BigInt(length)),
  };
}
