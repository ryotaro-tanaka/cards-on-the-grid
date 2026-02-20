import { applyEvent } from './applyEvent.js';
import type { Command, Event, GameState, Piece, ValidationResult } from './types.js';
import { validateIntent } from './validateIntent.js';

function homeRows(owner: string): number[] {
  return owner === 'p1' ? [0, 1] : [6, 5];
}

function firstSpawnPosition(state: GameState, owner: string): { x: number; y: number } | null {
  const occupied = new Set(state.pieces.map((piece) => `${piece.position.x},${piece.position.y}`));

  for (const y of homeRows(owner)) {
    for (let x = 0; x < 7; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        return { x, y };
      }
    }
  }

  return null;
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

  const defender = state.pieces.find(
    (piece) =>
      piece.owner !== command.actorPlayerId &&
      piece.position.x === intent.to.x &&
      piece.position.y === intent.to.y,
  );

  if (!defender) {
    return [
      {
        type: 'PieceMoved',
        pieceId: intent.pieceId,
        from: attacker.position,
        to: intent.to,
      },
    ];
  }

  const damage = attacker.stats.attack;
  const defenderHpAfter = defender.currentHp - damage;
  const defenderDefeated = defenderHpAfter <= 0;

  const events: Event[] = [
    {
      type: 'CombatResolved',
      attackerPieceId: attacker.id,
      defenderPieceId: defender.id,
      damage,
      defenderHpAfter,
      defenderDefeated,
    },
  ];

  if (defenderDefeated) {
    events.push({
      type: 'PieceMoved',
      pieceId: intent.pieceId,
      from: attacker.position,
      to: intent.to,
    });

    const remainingDefenderCount = state.pieces.filter(
      (piece) => piece.owner === defender.owner && piece.id !== defender.id,
    ).length;

    if (remainingDefenderCount === 0) {
      events.push({
        type: 'GameFinished',
        winner: command.actorPlayerId,
      });
    }
  }

  return events;
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

  if (command.intent.type === 'EndTurn') {
    nextState = {
      ...nextState,
      phase: 'Main',
    };
  }

  return { state: nextState, events, validation };
}
