import { applyCommand } from './applyCommand.js';
import type { GameState, Intent, Event } from './types.js';

export function applyIntent(
  state: GameState,
  intent: Intent,
): { state: GameState; events: Event[] } {
  const result = applyCommand(state, {
    actorPlayerId: state.activePlayer,
    intent,
  });

  return {
    state: result.state,
    events: result.events,
  };
}
