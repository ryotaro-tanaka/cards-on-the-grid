export type PlayerId = string; // or a more specific type if needed

export type Coord = [number, number]; // Example: [x, y]

export type PieceId = string; // or a more specific type if needed

export type GameState = {
  turn: number;
};

export type EndTurn = {};

export type Move = {
  pieceId: PieceId;
  to: Coord;
};

export type Intent = EndTurn | Move;

export type TurnEnded = {};

export type PieceMoved = {
  pieceId: PieceId;
  from: Coord;
  to: Coord;
};

export type Event = TurnEnded | PieceMoved;
