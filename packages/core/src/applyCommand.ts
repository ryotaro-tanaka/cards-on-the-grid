import { applyEvent } from './applyEvent.js';
import type { Command, Event, GameState, ValidationResult } from './types.js';
import { validateIntent } from './validateIntent.js';

function buildEvents(state: GameState, command: Command): Event[] {
  const { intent } = command;

  if (intent.type === 'EndTurn') {
    const nextOwner = state.activePlayer === state.players[0] ? state.players[1] : state.players[0];
    const nextTurnNo = state.turn + 1;

    return [
      {
        type: 'TurnEnded',
        nextTurn: {
          owner: nextOwner,
          turnNo: nextTurnNo,
        },
      },
    ];
  }

  const attacker = state.pieces.find((p) => p.id === intent.pieceId);
  if (!attacker) {
    throw new Error('buildEvents called with invalid state: attacker piece not found');
  }

  const events: Event[] = [
    {
      type: 'PieceMoved',
      pieceId: intent.pieceId,
      from: attacker.position,
      to: intent.to,
    },
  ];

  const defender = state.pieces.find(
    (piece) =>
      piece.owner !== command.actorPlayerId &&
      piece.position.x === intent.to.x &&
      piece.position.y === intent.to.y,
  );

  if (!defender) {
    return events;
  }

  const damage = attacker.stats.attack;
  const defenderHpAfter = defender.currentHp - damage;
  const defenderDefeated = defenderHpAfter <= 0;

  events.push({
    type: 'CombatResolved',
    attackerPieceId: attacker.id,
    defenderPieceId: defender.id,
    damage,
    defenderHpAfter,
    defenderDefeated,
  });

  if (defenderDefeated) {
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
  const nextState = events.reduce((currentState, event) => applyEvent(currentState, event), state);

  return { state: nextState, events, validation };
}
