import { Chess } from "chess.js";
import { v4 as uuidv4 } from "uuid";
import type {
  Game,
  Color,
  MoveInput,
  MoveResult,
  ChatMessage,
  GameEvent,
  JoinResult,
} from "./types.js";

export const INITIAL_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export type Store = ReturnType<typeof createStore>;

export function createStore() {
  const games = new Map<string, Game>();
  const sseHandlers = new Map<string, Set<(event: GameEvent) => void>>();

  function emit(gameId: string, event: GameEvent): void {
    sseHandlers.get(gameId)?.forEach((h) => h(event));
  }

  function subscribe(
    gameId: string,
    handler: (event: GameEvent) => void,
  ): () => void {
    if (!sseHandlers.has(gameId)) sseHandlers.set(gameId, new Set());
    sseHandlers.get(gameId)!.add(handler);
    return () => sseHandlers.get(gameId)?.delete(handler);
  }

  function createGame(hostId: string, hostColor: Color): Game {
    const id = uuidv4();
    const game: Game = {
      id,
      hostId,
      hostColor,
      guestId: null,
      status: "waiting",
      fen: INITIAL_FEN,
      turn: "white",
      inCheck: false,
      result: null,
      drawReason: null,
      finishReason: null,
      chat: [],
      createdAt: Date.now(),
      moveHistory: [],
      moveCount: 0,
    };
    games.set(id, game);
    return { ...game };
  }

  function getGame(id: string): Game | undefined {
    const g = games.get(id);
    return g
      ? { ...g, chat: [...g.chat], moveHistory: [...g.moveHistory] }
      : undefined;
  }

  function joinGame(id: string, playerId: string): JoinResult {
    const game = games.get(id);
    if (!game) return { success: false, error: "Game not found" };

    // Host re-opens their own lobby
    if (game.hostId === playerId) {
      return { success: true, game: getGame(id), alreadyHost: true };
    }

    // Guest reconnects
    if (game.guestId === playerId) {
      return { success: true, game: getGame(id), alreadyGuest: true };
    }

    // Game is already full
    if (game.status !== "waiting" || game.guestId !== null) {
      return { success: false, error: "Game is full or already started" };
    }

    // New guest joins
    game.guestId = playerId;
    game.status = "active";

    const chess = new Chess();
    game.fen = chess.fen();
    game.turn = "white";
    game.inCheck = false;

    const snapshot = getGame(id)!;
    emit(id, { type: "game_started", gameId: id, data: snapshot });

    return { success: true, game: snapshot };
  }

  function makeMove(id: string, playerId: string, move: MoveInput): MoveResult {
    const game = games.get(id);
    if (!game) return { accepted: false, reason: "Game not found" };

    // Authorization
    if (game.hostId !== playerId && game.guestId !== playerId) {
      return { accepted: false, reason: "Not authorized" };
    }

    // Game must be active
    if (game.status === "finished") {
      return { accepted: false, reason: "Game is finished" };
    }
    if (game.status === "waiting") {
      return { accepted: false, reason: "Game not started yet" };
    }

    // Determine player's color
    const playerColor: Color =
      game.hostId === playerId
        ? game.hostColor
        : game.hostColor === "white"
          ? "black"
          : "white";

    // Validate turn
    const chess = new Chess(game.fen);
    const currentTurn: Color = chess.turn() === "w" ? "white" : "black";
    if (currentTurn !== playerColor) {
      return { accepted: false, reason: "Not your turn" };
    }

    // Validate and apply move
    let chessMoveResult;
    try {
      chessMoveResult = chess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      });
      if (!chessMoveResult) return { accepted: false, reason: "Illegal move" };
    } catch {
      return { accepted: false, reason: "Illegal move" };
    }

    // Update state
    game.fen = chess.fen();
    game.turn = chess.turn() === "w" ? "white" : "black";
    game.inCheck = chess.inCheck();
    game.moveHistory.push(chessMoveResult.san);
    game.moveCount++;

    // Check game over conditions
    if (chess.isCheckmate()) {
      game.status = "finished";
      game.result = playerColor;
      game.finishReason = "checkmate";
    } else if (chess.isStalemate()) {
      game.status = "finished";
      game.result = "draw";
      game.finishReason = "stalemate";
      game.drawReason = "stalemate";
    } else if (chess.isInsufficientMaterial()) {
      game.status = "finished";
      game.result = "draw";
      game.finishReason = "draw";
      game.drawReason = "insufficient_material";
    } else if (chess.isThreefoldRepetition()) {
      game.status = "finished";
      game.result = "draw";
      game.finishReason = "draw";
      game.drawReason = "threefold_repetition";
    } else if (chess.isDraw()) {
      game.status = "finished";
      game.result = "draw";
      game.finishReason = "draw";
      game.drawReason = "fifty_move_rule";
    }

    const snapshot = getGame(id)!;

    // Emit SSE event — no event for rejected moves (handled by returning early above)
    if (game.status === "finished") {
      emit(id, { type: "game_over", gameId: id, data: snapshot });
    } else {
      emit(id, { type: "state_update", gameId: id, data: snapshot });
    }

    return { accepted: true, game: snapshot };
  }

  function addChatMessage(
    id: string,
    playerId: string,
    text: string,
  ): { success: boolean; message?: ChatMessage; error?: string } {
    const game = games.get(id);
    if (!game) return { success: false, error: "Game not found" };

    if (game.hostId !== playerId && game.guestId !== playerId) {
      return { success: false, error: "Not authorized" };
    }

    const playerColor: Color =
      game.hostId === playerId
        ? game.hostColor
        : game.hostColor === "white"
          ? "black"
          : "white";

    const message: ChatMessage = {
      id: uuidv4(),
      playerId,
      playerColor,
      text,
      timestamp: Date.now(),
    };
    game.chat.push(message);

    emit(id, {
      type: "chat_message",
      gameId: id,
      data: { chat: [...game.chat] },
    });

    return { success: true, message: { ...message } };
  }

  function getChatMessages(
    id: string,
    requesterId: string,
  ): { success: boolean; messages?: ChatMessage[]; error?: string } {
    const game = games.get(id);
    if (!game) return { success: false, error: "Game not found" };

    if (game.hostId !== requesterId && game.guestId !== requesterId) {
      return { success: false, error: "Not authorized" };
    }

    return { success: true, messages: game.chat.map((m) => ({ ...m })) };
  }

  return {
    createGame,
    getGame,
    joinGame,
    makeMove,
    addChatMessage,
    getChatMessages,
    subscribe,
    emit,
  };
}

// Singleton for production use (SvelteKit server)
export const store = createStore();
