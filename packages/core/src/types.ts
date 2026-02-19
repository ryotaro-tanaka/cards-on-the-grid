export type PlayerId = string;
export type PieceId = string;

export type Coord = { x: number; y: number };

export type Piece = {
  id: PieceId;
  owner: PlayerId;
  position: Coord;
};

export type GameState = {
  turn: number;
  players: [PlayerId, PlayerId];
  activePlayer: PlayerId;
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
