import { applyEvent } from './applyEvent.js';
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

function buildEvents(state: GameState, command: Command): Event[] {
  const { intent } = command;

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

    return events;
  }

  const attacker = state.pieces.find((p) => p.id === intent.pieceId);
  if (!attacker) {
    throw new Error('buildEvents called with invalid state: attacker piece not found');
  }

  const nextEvents: Event[] = [
    {
      type: 'PieceMoved',
      pieceId: attacker.id,
      from: attacker.position,
      to: intent.to,
    },
  ];

  const range = attacker.kind === 'Lancer' ? 2 : 1;
  const delta = forwardDelta(state, attacker.owner);
  const targetYValues = Array.from({ length: range }, (_, index) => intent.to.y + delta * (index + 1)).filter(
    (y) => y >= 0 && y < 7,
  );

  const defenders = state.pieces.filter(
    (piece) =>
      piece.owner !== attacker.owner && piece.position.x === intent.to.x && targetYValues.includes(piece.position.y),
  );

  for (const defender of defenders) {
    const damage = attacker.stats.attack;
    const defenderHpAfter = defender.currentHp - damage;
    const defenderDefeated = defenderHpAfter <= 0;

    nextEvents.push({
      type: 'CombatResolved',
      attackerPieceId: attacker.id,
      defenderPieceId: defender.id,
      damage,
      defenderHpAfter,
      defenderDefeated,
    });
  }

  return nextEvents;
}

export function applyCommand(
  state: GameState,
  command: Command,
): { state: GameState; events: Event[]; validation: ValidationResult } {
  const validation = validateIntent(state, command);
  if (!validation.ok) {
    return { state, events: [], validation };
  }

  const events = buildEvents(state, command);
  let nextState = events.reduce((currentState, event) => applyEvent(currentState, event), state);

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
