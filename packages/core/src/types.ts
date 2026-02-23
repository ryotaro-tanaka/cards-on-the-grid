export type PlayerId = string;
export type PieceId = string;

export type Coord = { x: number; y: number };

export type CreatureKind =
  | 'Ameba'
  | 'Goblin'
  | 'Soldier'
  | 'Lancer'
  | 'Hobgoblin'
  | 'Ninja'
  | 'Bomber'
  | 'GiantBoa'
  | 'Alchemist';

export type CardKind =
  | 'Move'
  | 'Assault'
  | 'Arrowrain'
  | 'Rock Bombardment'
  | 'Lightning'
  | 'Recharge'
  | 'Doping'
  | 'Barrier'
  | 'Breath'
  | 'Mine'
  | 'Stealing';

export type CardInstance = {
  id: string;
  kind: CardKind;
};

export type CreatureStats = {
  maxHp: number;
  attack: number;
  successorCost: number;
};

export type Piece = {
  id: PieceId;
  owner: PlayerId;
  kind: CreatureKind;
  stats: CreatureStats;
  currentHp: number;
  position: Coord;
  activeSkillUsed: boolean;
};

export type PendingSuccessor = {
  id: string;
  owner: PlayerId;
  kind: CreatureKind;
  stats: CreatureStats;
  turnsRemaining: number;
};

export type Mine = {
  owner: PlayerId;
  position: Coord;
};

export type GamePhase = 'Reinforcement' | 'Draw' | 'Main' | 'End';

export type GameStatus = 'InProgress' | 'Finished';

export type TurnState = {
  movedPieceIds: PieceId[];
};

export type RngState = {
  seed: bigint;
  state: bigint;
  nextCardInstanceNo: number;
};

export type GameState = {
  turn: number;
  players: [PlayerId, PlayerId];
  activePlayer: PlayerId;
  phase: GamePhase;
  status: GameStatus;
  winner: PlayerId | null;
  turnState: TurnState;
  pendingSuccessors: PendingSuccessor[];
  pieces: Piece[];
  hands: Record<PlayerId, CardInstance[]>;
  mines: Mine[];
  rngState: RngState;
};

export type EndTurn = { type: 'EndTurn' };

export type Move = {
  type: 'Move';
  pieceId: PieceId;
  to: Coord;
};

export type UseCard = {
  type: 'UseCard';
  cardId: string;
  cardKind: CardKind;
  pieceId?: PieceId;
  to?: Coord;
  targetPlayerId?: PlayerId;
  targetPieceId?: PieceId;
};

export type Intent = EndTurn | Move | UseCard;

export type Command = {
  actorPlayerId: PlayerId;
  intent: Intent;
};

export type TurnEnded = {
  type: 'TurnEnded';
  nextTurn: {
    owner: PlayerId;
    turnNo: number;
  };
};

export type PieceMoved = {
  type: 'PieceMoved';
  pieceId: PieceId;
  from: Coord;
  to: Coord;
};

export type CombatResolved = {
  type: 'CombatResolved';
  attackerPieceId: PieceId;
  defenderPieceId: PieceId;
  damage: number;
  defenderHpAfter: number;
  defenderDefeated: boolean;
};

export type PieceDamaged = {
  type: 'PieceDamaged';
  pieceId: PieceId;
  damage: number;
  hpAfter: number;
  defeated: boolean;
  source: 'Card' | 'Mine';
};

export type PieceBuffed = {
  type: 'PieceBuffed';
  pieceId: PieceId;
  attackDelta: number;
  maxHpDelta: number;
  currentHpDelta: number;
};

export type ActiveSkillReset = {
  type: 'ActiveSkillReset';
  pieceId: PieceId;
};

export type MineTriggered = {
  type: 'MineTriggered';
  mineOwner: PlayerId;
  triggeredByPieceId: PieceId;
  position: Coord;
  damage: number;
  hpAfter: number;
  defeated: boolean;
};

export type SuccessorSpawned = {
  type: 'SuccessorSpawned';
  pendingId: string;
  piece: Piece;
};

export type CardDrawn = {
  type: 'CardDrawn';
  playerId: PlayerId;
  card: CardInstance;
};

export type CardDiscardedForDrawLimit = {
  type: 'CardDiscardedForDrawLimit';
  playerId: PlayerId;
  discardedCardId: string;
};

export type CardUsed = {
  type: 'CardUsed';
  playerId: PlayerId;
  cardId: string;
  cardKind: CardKind;
};

export type CardStolen = {
  type: 'CardStolen';
  fromPlayerId: PlayerId;
  toPlayerId: PlayerId;
  card: CardInstance;
};

export type MinePlaced = {
  type: 'MinePlaced';
  owner: PlayerId;
  position: Coord;
};

export type GameFinished = {
  type: 'GameFinished';
  winner: PlayerId;
};

export type Event =
  | TurnEnded
  | PieceMoved
  | CombatResolved
  | PieceDamaged
  | PieceBuffed
  | ActiveSkillReset
  | MineTriggered
  | SuccessorSpawned
  | CardDrawn
  | CardDiscardedForDrawLimit
  | CardUsed
  | CardStolen
  | MinePlaced
  | GameFinished;

export type InvalidReason =
  | 'NOT_ACTIVE_PLAYER'
  | 'PIECE_NOT_FOUND'
  | 'PIECE_NOT_OWNED_BY_ACTOR'
  | 'OUT_OF_BOUNDS'
  | 'GAME_ALREADY_FINISHED'
  | 'PHASE_MISMATCH'
  | 'INVALID_MOVE_DISTANCE'
  | 'SAME_POSITION'
  | 'CELL_OCCUPIED'
  | 'MOVE_ALREADY_USED_THIS_TURN'
  | 'CARD_NOT_FOUND_IN_HAND'
  | 'CARD_KIND_MISMATCH'
  | 'TARGET_PLAYER_INVALID'
  | 'TARGET_PLAYER_HAND_EMPTY'
  | 'TARGET_PIECE_NOT_FOUND'
  | 'TARGET_PIECE_NOT_OWNED_BY_ACTOR'
  | 'TARGET_PIECE_NOT_ENEMY'
  | 'INVALID_CARD_TARGET'
  | 'INVALID_CARD_DESTINATION'
  | 'ACTIVE_SKILL_NOT_APPLICABLE';

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: InvalidReason };
