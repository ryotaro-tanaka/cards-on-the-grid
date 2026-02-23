import { buildDrawEvents, createRngState } from './cardSystem.js';
import { applyEvent } from './applyEvent.js';
import type { Coord, CreatureKind, CreatureStats, GameState, Piece, PlayerId } from './types.js';

export const CREATURE_BASE_STATS: Record<CreatureKind, CreatureStats> = {
  Ameba: { maxHp: 1, attack: 1, successorCost: 1 },
  Goblin: { maxHp: 2, attack: 2, successorCost: 2 },
  Soldier: { maxHp: 3, attack: 3, successorCost: 3 },
  Lancer: { maxHp: 2, attack: 1, successorCost: 3 },
  Hobgoblin: { maxHp: 1, attack: 1, successorCost: 3 },
  Ninja: { maxHp: 2, attack: 2, successorCost: 4 },
  Bomber: { maxHp: 1, attack: 0, successorCost: 3 },
  GiantBoa: { maxHp: 2, attack: 2, successorCost: 3 },
  Alchemist: { maxHp: 1, attack: 1, successorCost: 5 },
};

export const DEFAULT_INITIAL_CREATURE_KINDS: [CreatureKind, CreatureKind, CreatureKind] = [
  'Ameba',
  'Goblin',
  'Soldier',
];

export const ALL_CREATURE_KINDS: CreatureKind[] = Object.keys(CREATURE_BASE_STATS) as CreatureKind[];

const PLAYER1_INITIAL_POSITIONS: [Coord, Coord, Coord] = [
  { x: 1, y: 1 },
  { x: 3, y: 1 },
  { x: 5, y: 1 },
];
const PLAYER2_INITIAL_POSITIONS: [Coord, Coord, Coord] = [
  { x: 1, y: 5 },
  { x: 3, y: 5 },
  { x: 5, y: 5 },
];

export type InitialCreatureSet = [CreatureKind, CreatureKind, CreatureKind];

export type InitialStateOptions = {
  players?: [PlayerId, PlayerId];
  creaturesByPlayer?: {
    p1: InitialCreatureSet;
    p2: InitialCreatureSet;
  };
  rngSeed?: bigint;
};

function buildPiece(owner: PlayerId, kind: CreatureKind, position: Coord): Piece {
  const stats = CREATURE_BASE_STATS[kind];

  return {
    id: `${owner}_${kind.toLowerCase()}_${position.x}_${position.y}`,
    owner,
    kind,
    stats,
    currentHp: stats.maxHp,
    position,
    activeSkillUsed: false,
  };
}

function buildInitialPieces(
  firstPlayerId: PlayerId,
  secondPlayerId: PlayerId,
  creaturesByPlayer: InitialStateOptions['creaturesByPlayer'],
): Piece[] {
  const p1Creatures = creaturesByPlayer?.p1 ?? DEFAULT_INITIAL_CREATURE_KINDS;
  const p2Creatures = creaturesByPlayer?.p2 ?? DEFAULT_INITIAL_CREATURE_KINDS;

  return [
    ...p1Creatures.map((kind, index) => buildPiece(firstPlayerId, kind, PLAYER1_INITIAL_POSITIONS[index])),
    ...p2Creatures.map((kind, index) => buildPiece(secondPlayerId, kind, PLAYER2_INITIAL_POSITIONS[index])),
  ];
}

export function createInitialState(options?: InitialStateOptions): GameState {
  const [firstPlayerId, secondPlayerId] = options?.players ?? ['p1', 'p2'];

  let state: GameState = {
    turn: 1,
    players: [firstPlayerId, secondPlayerId],
    activePlayer: firstPlayerId,
    phase: 'Main',
    status: 'InProgress',
    winner: null,
    turnState: {
      movedPieceIds: [],
    },
    pendingSuccessors: [],
    pieces: buildInitialPieces(firstPlayerId, secondPlayerId, options?.creaturesByPlayer),
    hands: {
      [firstPlayerId]: [],
      [secondPlayerId]: [],
    },
    mines: [],
    rngState: createRngState(options?.rngSeed ?? 1n),
  };

  for (const playerId of state.players) {
    for (let i = 0; i < 3; i += 1) {
      const draw = buildDrawEvents(playerId, state.hands[playerId] ?? [], state.rngState);
      state = draw.events.reduce((acc, event) => applyEvent(acc, event), {
        ...state,
        rngState: draw.rngState,
      });
    }
  }

  return state;
}
