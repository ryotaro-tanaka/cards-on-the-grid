import { applyEvent } from './applyEvent.js';
import { buildDrawEvents, rollIndex } from './cardSystem.js';
import type { Command, Event, GameState, Piece, PlayerId, ValidationResult } from './types.js';
import { validateIntent } from './validateIntent.js';

function isFirstPlayer(state: GameState, owner: PlayerId): boolean {
  return owner === state.players[0];
}

function defenseRows(state: GameState, owner: PlayerId): [number] {
  return isFirstPlayer(state, owner) ? [0] : [6];
}

function reinforcementRows(state: GameState, owner: PlayerId): [number, number] {
  return isFirstPlayer(state, owner) ? [1, 2] : [5, 4];
}

function firstSpawnPosition(state: GameState, owner: PlayerId): { x: number; y: number } | null {
  const occupied = new Set(state.pieces.map((piece) => `${piece.position.x},${piece.position.y}`));

  for (const y of reinforcementRows(state, owner)) {
    for (let x = 0; x < 7; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        return { x, y };
      }
    }
  }

  return null;
}

function determineWinner(state: GameState): PlayerId | null {
  const [firstPlayer, secondPlayer] = state.players;

  for (const piece of state.pieces) {
    const opponentDefense =
      piece.owner === firstPlayer ? defenseRows(state, secondPlayer) : defenseRows(state, firstPlayer);
    if (opponentDefense.includes(piece.position.y)) {
      return piece.owner;
    }
  }

  return null;
}

function forwardDelta(state: GameState, owner: PlayerId): 1 | -1 {
  return isFirstPlayer(state, owner) ? 1 : -1;
}

function buildCombatEvents(state: GameState, attacker: Piece, to: { x: number; y: number }): Event[] {
  const range = attacker.kind === 'Lancer' ? 2 : 1;
  const delta = forwardDelta(state, attacker.owner);
  const targetYValues = Array.from({ length: range }, (_, index) => to.y + delta * (index + 1)).filter(
    (y) => y >= 0 && y < 7,
  );

  const defenders = state.pieces.filter(
    (piece) => piece.owner !== attacker.owner && piece.position.x === to.x && targetYValues.includes(piece.position.y),
  );

  return defenders.map((defender) => {
    const damage = attacker.stats.attack;
    const defenderHpAfter = defender.currentHp - damage;
    const defenderDefeated = defenderHpAfter <= 0;

    return {
      type: 'CombatResolved',
      attackerPieceId: attacker.id,
      defenderPieceId: defender.id,
      damage,
      defenderHpAfter,
      defenderDefeated,
    } satisfies Event;
  });
}

function buildMineTriggerEvents(state: GameState, movedPieceId: string, owner: PlayerId, to: { x: number; y: number }): Event[] {
  const mine = state.mines.find((m) => m.owner !== owner && m.position.x === to.x && m.position.y === to.y);
  if (!mine) {
    return [];
  }

  const movedPiece = state.pieces.find((piece) => piece.id === movedPieceId);
  if (!movedPiece) {
    return [];
  }

  const damage = 1;
  const hpAfter = movedPiece.currentHp - damage;
  return [
    {
      type: 'MineTriggered',
      mineOwner: mine.owner,
      triggeredByPieceId: movedPieceId,
      position: to,
      damage,
      hpAfter,
      defeated: hpAfter <= 0,
    },
  ];
}

function buildMovementEvents(state: GameState, attacker: Piece, to: { x: number; y: number }, withCombat: boolean): Event[] {
  const events: Event[] = [
    {
      type: 'PieceMoved',
      pieceId: attacker.id,
      from: attacker.position,
      to,
    },
    ...buildMineTriggerEvents(state, attacker.id, attacker.owner, to),
  ];

  if (withCombat) {
    const projected = events.reduce((acc, event) => applyEvent(acc, event), state);
    if (projected.pieces.some((piece) => piece.id === attacker.id)) {
      events.push(...buildCombatEvents(projected, projected.pieces.find((p) => p.id === attacker.id)!, to));
    }
  }

  return events;
}

function buildEvents(state: GameState, command: Command): { events: Event[]; rngState: GameState['rngState'] } {
  const { intent, actorPlayerId } = command;

  if (intent.type === 'EndTurn') {
    const nextOwner = state.activePlayer === state.players[0] ? state.players[1] : state.players[0];
    const nextTurnNo = state.turn + 1;

    const events: Event[] = [
      {
        type: 'TurnEnded',
        nextTurn: {
          owner: nextOwner,
          turnNo: nextTurnNo,
        },
      },
    ];

    const readySuccessors = state.pendingSuccessors
      .filter((pending) => pending.owner === nextOwner)
      .map((pending) => ({
        ...pending,
        turnsRemaining: Math.max(0, pending.turnsRemaining - 1),
      }))
      .filter((pending) => pending.turnsRemaining === 0);

    let projection: GameState = { ...state };
    for (const pending of readySuccessors) {
      const spawnTo = firstSpawnPosition(projection, pending.owner);
      if (!spawnTo) {
        continue;
      }

      const piece: Piece = {
        id: `${pending.owner}_${pending.kind.toLowerCase()}_${nextTurnNo}_${events.length}`,
        owner: pending.owner,
        kind: pending.kind,
        stats: pending.stats,
        currentHp: pending.stats.maxHp,
        position: spawnTo,
        activeSkillUsed: false,
      };

      events.push({
        type: 'SuccessorSpawned',
        pendingId: pending.id,
        piece,
      });

      projection = {
        ...projection,
        pieces: [...projection.pieces, piece],
      };
    }

    const draw = buildDrawEvents(nextOwner, state.hands[nextOwner] ?? [], state.rngState);
    events.push(...draw.events);

    return { events, rngState: draw.rngState };
  }

  if (intent.type === 'UseCard') {
    const events: Event[] = [
      {
        type: 'CardUsed',
        playerId: actorPlayerId,
        cardId: intent.cardId,
        cardKind: intent.cardKind,
      },
    ];

    if (intent.cardKind === 'Move' || intent.cardKind === 'Assault') {
      const piece = state.pieces.find((p) => p.id === intent.pieceId)!;
      events.push(...buildMovementEvents(state, piece, intent.to!, intent.cardKind === 'Assault'));
      return { events, rngState: state.rngState };
    }

    if (intent.cardKind === 'Arrowrain' || intent.cardKind === 'Rock Bombardment' || intent.cardKind === 'Lightning') {
      const target = state.pieces.find((piece) => piece.id === intent.targetPieceId)!;
      const damage = intent.cardKind === 'Arrowrain' ? 1 : intent.cardKind === 'Rock Bombardment' ? 2 : 3;
      const hpAfter = target.currentHp - damage;
      events.push({ type: 'PieceDamaged', pieceId: target.id, damage, hpAfter, defeated: hpAfter <= 0, source: 'Card' });
      return { events, rngState: state.rngState };
    }

    if (intent.cardKind === 'Recharge') {
      events.push({ type: 'ActiveSkillReset', pieceId: intent.pieceId! });
      return { events, rngState: state.rngState };
    }

    if (intent.cardKind === 'Doping' || intent.cardKind === 'Barrier' || intent.cardKind === 'Breath') {
      const attackDelta = intent.cardKind === 'Barrier' || intent.cardKind === 'Breath' ? 1 : 0;
      const maxHpDelta = intent.cardKind === 'Doping' || intent.cardKind === 'Breath' ? 1 : 0;
      const currentHpDelta = intent.cardKind === 'Doping' || intent.cardKind === 'Breath' ? 1 : 0;
      events.push({ type: 'PieceBuffed', pieceId: intent.pieceId!, attackDelta, maxHpDelta, currentHpDelta });
      return { events, rngState: state.rngState };
    }

    if (intent.cardKind === 'Mine') {
      events.push({ type: 'MinePlaced', owner: actorPlayerId, position: intent.to! });
      return { events, rngState: state.rngState };
    }

    const opponent = intent.targetPlayerId!;
    const enemyHand = state.hands[opponent] ?? [];
    const rolled = rollIndex(state.rngState, enemyHand.length);
    events.push({
      type: 'CardStolen',
      fromPlayerId: opponent,
      toPlayerId: actorPlayerId,
      card: enemyHand[rolled.index],
    });
    return { events, rngState: rolled.rngState };
  }

  const attacker = state.pieces.find((p) => p.id === intent.pieceId);
  if (!attacker) {
    throw new Error('buildEvents called with invalid state: attacker piece not found');
  }

  return {
    events: buildMovementEvents(state, attacker, intent.to, true),
    rngState: state.rngState,
  };
}

export function applyCommand(
  state: GameState,
  command: Command,
): { state: GameState; events: Event[]; validation: ValidationResult } {
  const validation = validateIntent(state, command);
  if (!validation.ok) {
    return { state, events: [], validation };
  }

  const { events, rngState } = buildEvents(state, command);
  let nextState = events.reduce((currentState, event) => applyEvent(currentState, event), {
    ...state,
    rngState,
  });

  const winner = determineWinner(nextState);
  if (winner && !events.some((event) => event.type === 'GameFinished')) {
    const finished: Event = {
      type: 'GameFinished',
      winner,
    };
    events.push(finished);
    nextState = applyEvent(nextState, finished);
  }

  if (command.intent.type === 'EndTurn') {
    nextState = {
      ...nextState,
      phase: 'Main',
    };
  }

  return { state: nextState, events, validation };
}
