export type Color = "white" | "black";
export type GameStatus = "waiting" | "active" | "finished";
export type GameResult = "white" | "black" | "draw" | null;
export type DrawReason =
  | "stalemate"
  | "insufficient_material"
  | "threefold_repetition"
  | "fifty_move_rule"
  | null;
export type FinishReason = "checkmate" | "stalemate" | "draw" | null;

export interface ChatMessage {
  id: string;
  playerId: string;
  playerColor: Color;
  text: string;
  timestamp: number;
}

export interface Game {
  id: string;
  hostId: string;
  hostColor: Color;
  guestId: string | null;
  status: GameStatus;
  fen: string;
  turn: Color;
  inCheck: boolean;
  result: GameResult;
  drawReason: DrawReason;
  finishReason: FinishReason;
  chat: ChatMessage[];
  createdAt: number;
  moveHistory: string[];
  moveCount: number;
}

export interface MoveInput {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

export interface MoveResult {
  accepted: boolean;
  reason?: string;
  game?: Game;
}

export interface JoinResult {
  success: boolean;
  game?: Game;
  error?: string;
  alreadyHost?: boolean;
  alreadyGuest?: boolean;
}

export type EventType =
  | "game_started"
  | "state_update"
  | "game_over"
  | "chat_message"
  | "ping";

export interface GameEvent {
  type: EventType;
  gameId: string;
  data: Partial<Game>;
}
