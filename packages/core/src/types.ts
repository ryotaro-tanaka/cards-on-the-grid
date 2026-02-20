export type PlayerId = string;
export type PieceId = string;

export type Coord = { x: number; y: number };

export type CreatureKind = 'Ameba' | 'Goblin' | 'Soldier';

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
};

export type GamePhase = 'Reinforcement' | 'Main' | 'End';

export type GameStatus = 'InProgress' | 'Finished';

export type TurnState = {
  movedPieceIds: PieceId[];
};

export type GameState = {
  turn: number;
  players: [PlayerId, PlayerId];
  activePlayer: PlayerId;
  phase: GamePhase;
  status: GameStatus;
  winner: PlayerId | null;
  turnState: TurnState;
  pieces: Piece[];
};

export type EndTurn = { type: 'EndTurn' };

export type Move = {
  type: 'Move';
  pieceId: PieceId;
  to: Coord;
};

export type Intent = EndTurn | Move;

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

export type Event = TurnEnded | PieceMoved;

export type InvalidReason =
  | 'NOT_ACTIVE_PLAYER'
  | 'PIECE_NOT_FOUND'
  | 'PIECE_NOT_OWNED_BY_ACTOR'
  | 'OUT_OF_BOUNDS';

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: InvalidReason };
