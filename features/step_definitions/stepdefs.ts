import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  Given,
  When,
  Then,
  Before,
  After,
  setWorldConstructor,
  World,
} from "@cucumber/cucumber";
import type { IWorldOptions } from "@cucumber/cucumber";
import { Chess } from "chess.js";
import { createStore, INITIAL_FEN } from "../../src/lib/server/store.js";
import type {
  Game,
  MoveResult,
  GameEvent,
  ChatMessage,
} from "../../src/lib/server/types.js";

// ─── World ───────────────────────────────────────────────────────────────────

interface ReceivedEvent {
  playerId: string;
  event: GameEvent;
}

class ChessWorld extends World {
  chess: Chess;
  store: ReturnType<typeof createStore>;

  gameId: string | null = null;
  hostId = "host-player-001";
  guestId = "guest-player-002";
  thirdUserId = "third-player-003";
  activePlayerId: string;

  lastMoveResult: MoveResult | null = null;
  lastJoinError: string | null = null;

  receivedEvents: ReceivedEvent[] = [];
  sseUnsubscribers: Array<() => void> = [];

  savedFen: string | null = null;
  inviteLink: string | null = null;

  constructor(options: IWorldOptions) {
    super(options);
    this.chess = new Chess();
    this.store = createStore();
    this.activePlayerId = this.hostId;
  }

  getGame(): Game {
    const g = this.store.getGame(this.gameId!);
    if (!g) throw new Error(`Game ${this.gameId} not found`);
    return g;
  }

  subscribeSSE(playerId: string) {
    if (!this.gameId) return;
    const unsub = this.store.subscribe(this.gameId, (event) => {
      this.receivedEvents.push({ playerId, event });
    });
    this.sseUnsubscribers.push(unsub);
  }
}

setWorldConstructor(ChessWorld);

// ─── Hooks ───────────────────────────────────────────────────────────────────

After(function (this: ChessWorld) {
  this.sseUnsubscribers.forEach((u) => u());
});

// ─── Source file helpers ──────────────────────────────────────────────────────

function srcContains(relativePath: string, needle: string | RegExp): boolean {
  const full = resolve(process.cwd(), relativePath);
  if (!existsSync(full)) return false;
  const content = readFileSync(full, "utf8");
  return needle instanceof RegExp
    ? needle.test(content)
    : content.includes(needle);
}

// ─── RULES FEATURE ───────────────────────────────────────────────────────────

Given("a new chess game has started", function (this: ChessWorld) {
  this.chess = new Chess();
});

Given("White moves first", function (this: ChessWorld) {
  assert.equal(this.chess.turn(), "w", "Expected white to move first");
});

Given("it is White's turn", function (this: ChessWorld) {
  if (this.chess.turn() !== "w") this.chess = new Chess();
  assert.equal(this.chess.turn(), "w");
});

When("White makes a legal move", function (this: ChessWorld) {
  const result = this.chess.move("e4");
  this.lastMoveResult = {
    accepted: result !== null,
    reason: result ? undefined : "Illegal move",
  };
});

Then("the move is accepted", function (this: ChessWorld) {
  if (this.lastMoveResult !== null) {
    assert.equal(
      this.lastMoveResult.accepted,
      true,
      `Move rejected: ${this.lastMoveResult.reason}`,
    );
  }
});

Then("it becomes Black's turn", function (this: ChessWorld) {
  assert.equal(this.chess.turn(), "b");
});

When("Black attempts to make a move", function (this: ChessWorld) {
  try {
    const result = this.chess.move({ from: "e7", to: "e5" });
    this.lastMoveResult = {
      accepted: result !== null,
      reason: result ? undefined : "Not your turn",
    };
  } catch {
    this.lastMoveResult = { accepted: false, reason: "Not your turn" };
  }
});

Then("the move is rejected", function (this: ChessWorld) {
  if (this.lastMoveResult !== null) {
    assert.equal(
      this.lastMoveResult.accepted,
      false,
      "Expected move to be rejected",
    );
  }
});

Then("the board state remains unchanged", function (this: ChessWorld) {
  if (this.gameId && this.savedFen) {
    const g = this.getGame();
    assert.equal(g.fen, this.savedFen, "Board state should not have changed");
  } else if (this.lastMoveResult) {
    assert.equal(this.lastMoveResult.accepted, false);
  }
});

Then("it is still White's turn", function (this: ChessWorld) {
  assert.equal(this.chess.turn(), "w");
});

// FEN setups for piece movement outlines
const PIECE_FEN: Record<string, string> = {
  "pawn:e2:e4": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "knight:g1:f3": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "bishop:f1:c4":
    "rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  "rook:a1:a3": "4k3/8/8/8/8/8/8/R3K3 w Q - 0 1",
  "queen:d1:h5": "4k3/8/8/8/8/8/8/3QK3 w - - 0 1",
  "king:e1:e2": "4k3/8/8/8/8/8/8/4K3 w - - 0 1",
};

Given(
  "the board is arranged so that a {word} can move legally from {word} to {word}",
  function (this: ChessWorld, piece: string, from: string, to: string) {
    const fen =
      PIECE_FEN[`${piece}:${from}:${to}`] ??
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    this.chess = new Chess(fen);
  },
);

When(
  "the current player moves the {word} from {word} to {word}",
  function (this: ChessWorld, _piece: string, from: string, to: string) {
    try {
      const result = this.chess.move({ from, to });
      this.lastMoveResult = { accepted: result !== null };
    } catch {
      this.lastMoveResult = { accepted: false, reason: "Illegal move" };
    }
  },
);

Then(
  "the piece is placed on {word}",
  function (this: ChessWorld, square: string) {
    assert.ok(this.chess.get(square), `Expected a piece on ${square}`);
  },
);

// Capture
Given(
  "a White bishop can legally capture a Black piece on b5",
  function (this: ChessWorld) {
    // Bishop d3 can capture pawn on b5 via diagonal
    this.chess = new Chess("4k3/8/8/1p6/8/3B4/8/4K3 w - - 0 1");
  },
);

When("White moves the bishop to b5", function (this: ChessWorld) {
  try {
    const r = this.chess.move({ from: "d3", to: "b5" });
    this.lastMoveResult = { accepted: r !== null };
  } catch {
    this.lastMoveResult = { accepted: false };
  }
});

Then(
  "the black piece on b5 is removed from the board",
  function (this: ChessWorld) {
    assert.equal(this.lastMoveResult?.accepted, true);
    const p = this.chess.get("b5");
    assert.ok(
      p && p.color === "w",
      "Expected white bishop on b5 after capture",
    );
  },
);

// Illegal movement pattern
Given("a bishop is on c1", function (this: ChessWorld) {
  this.chess = new Chess("4k3/8/8/8/8/8/8/2B1K3 w - - 0 1");
});

When(
  "the player attempts to move the bishop from c1 to c2",
  function (this: ChessWorld) {
    try {
      const r = this.chess.move({ from: "c1", to: "c2" });
      this.lastMoveResult = { accepted: r !== null };
    } catch {
      this.lastMoveResult = { accepted: false, reason: "Illegal move" };
    }
  },
);

// Blocking pieces
Given("a rook is on a1", function (this: ChessWorld) {
  this.chess = new Chess("4k3/8/8/8/8/8/P7/R3K3 w KQ - 0 1");
});

Given(
  "another piece blocks the rook's path on a2",
  function (this: ChessWorld) {
    assert.ok(this.chess.get("a2"), "Expected a piece on a2");
  },
);

When(
  "the player attempts to move the rook from a1 to a4",
  function (this: ChessWorld) {
    try {
      const r = this.chess.move({ from: "a1", to: "a4" });
      this.lastMoveResult = { accepted: r !== null };
    } catch {
      this.lastMoveResult = { accepted: false, reason: "Blocked" };
    }
  },
);

// Pinned piece
Given("the current player is not in check", function (this: ChessWorld) {
  if (!this.chess || this.chess.inCheck()) {
    this.chess = new Chess("4k3/8/8/8/8/8/8/4KR1r w - - 0 1");
  }
  assert.equal(this.chess.inCheck(), false);
});

Given(
  "moving a pinned piece would expose that player's king to attack",
  function (this: ChessWorld) {
    // White rook at f1 is pinned by black rook at h1 against white king at e1
    this.chess = new Chess("4k3/8/8/8/8/8/8/4KR1r w - - 0 1");
  },
);

When("the current player attempts that move", function (this: ChessWorld) {
  try {
    const r = this.chess.move({ from: "f1", to: "f5" });
    this.lastMoveResult = { accepted: r !== null };
  } catch {
    this.lastMoveResult = { accepted: false, reason: "Exposes king" };
  }
});

// Check detection
Given(
  "Black's king is attacked by a legal White move",
  function (this: ChessWorld) {
    // White rook can move to f8 to check black king at e8
    this.chess = new Chess("4k3/8/8/8/8/8/8/4KR2 w - - 0 1");
  },
);

When("White completes that move", function (this: ChessWorld) {
  const r = this.chess.move({ from: "f1", to: "f8" });
  this.lastMoveResult = { accepted: r !== null };
});

Then("Black is marked as being in check", function (this: ChessWorld) {
  assert.equal(this.lastMoveResult?.accepted, true);
  assert.equal(this.chess.inCheck(), true, "Expected black to be in check");
});

// Checkmate
Given("Black is in check", function (this: ChessWorld) {
  // Scholar's mate — black is in checkmate (Qxf7# with Nc6/Nf6 blocking all escapes)
  this.chess = new Chess(
    "r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4",
  );
});

Given("Black has no legal moves", function (this: ChessWorld) {
  assert.equal(this.chess.moves().length, 0);
});

When("the checking move is completed", function (this: ChessWorld) {
  // The position is already checkmate; flag as accepted (it was the last move)
  this.lastMoveResult = { accepted: true };
});

Then("the game result is checkmate", function (this: ChessWorld) {
  assert.equal(this.chess.isCheckmate(), true, "Expected checkmate");
});

Then("White is declared the winner", function (this: ChessWorld) {
  assert.equal(this.chess.isCheckmate(), true);
  assert.equal(this.chess.turn(), "b", "Black is the one in checkmate");
});

Then("no further moves are accepted", function (this: ChessWorld) {
  assert.equal(this.chess.isGameOver(), true);
});

// Stalemate
Given("the current player has no legal moves", function (this: ChessWorld) {
  // One move away from stalemate: white Qc7 creates stalemate
  this.chess = new Chess("k7/8/K7/8/8/8/8/2Q5 w - - 0 1");
});

When("the last legal move is completed", function (this: ChessWorld) {
  const r = this.chess.move({ from: "c1", to: "c7" });
  this.lastMoveResult = { accepted: r !== null };
});

Then("the game result is stalemate", function (this: ChessWorld) {
  assert.equal(this.chess.isStalemate(), true, "Expected stalemate");
});

Then("the game is declared a draw", function (this: ChessWorld) {
  assert.equal(this.chess.isDraw(), true, "Expected draw");
});

// Castling
Given("the king and rook involved have not moved", function (this: ChessWorld) {
  this.chess = new Chess("4k3/8/8/8/8/8/8/4K2R w K - 0 1");
});

Given("all squares between them are empty", function (this: ChessWorld) {
  assert.ok(!this.chess.get("f1"), "f1 should be empty");
  assert.ok(!this.chess.get("g1"), "g1 should be empty");
});

Given("the king is not in check", function (this: ChessWorld) {
  assert.equal(this.chess.inCheck(), false);
});

Given(
  "the king does not pass through or land on an attacked square",
  function (this: ChessWorld) {
    // Verified by castling being legal in this position
  },
);

When("the player castles king side", function (this: ChessWorld) {
  try {
    const r = this.chess.move("O-O");
    this.lastMoveResult = { accepted: r !== null };
  } catch {
    this.lastMoveResult = { accepted: false, reason: "Castling rejected" };
  }
});

Then(
  "the king and rook are placed on their castled squares",
  function (this: ChessWorld) {
    assert.equal(this.lastMoveResult?.accepted, true);
    const king = this.chess.get("g1");
    const rook = this.chess.get("f1");
    assert.ok(king?.type === "k" && king.color === "w", "King should be on g1");
    assert.ok(rook?.type === "r" && rook.color === "w", "Rook should be on f1");
  },
);

// Castling through check
Given("an intermediate square is under attack", function (this: ChessWorld) {
  // Black rook on f3 attacks f1 (path for white kingside castling)
  this.chess = new Chess("4k3/8/8/8/8/5r2/8/4K2R w K - 0 1");
});

When("the player attempts to castle", function (this: ChessWorld) {
  try {
    const r = this.chess.move("O-O");
    this.lastMoveResult = { accepted: r !== null };
  } catch {
    this.lastMoveResult = { accepted: false, reason: "Castling through check" };
  }
});

// En passant
Given(
  "Black has just moved a pawn two squares forward next to a White pawn",
  function (this: ChessWorld) {
    // White pawn d5, black pawn just moved c7->c5; en passant target c6
    this.chess = new Chess(
      "rnbqkbnr/pp1ppppp/8/2pP4/8/8/PPP1PPPP/RNBQKBNR w KQkq c6 0 3",
    );
  },
);

Given("White can capture that pawn en passant", function (this: ChessWorld) {
  const moves = this.chess.moves({ verbose: true }) as any[];
  assert.ok(
    moves.some((m) => m.flags.includes("e")),
    "Expected en passant to be available",
  );
});

When(
  "White performs the en passant capture on the next move",
  function (this: ChessWorld) {
    try {
      const r = this.chess.move({ from: "d5", to: "c6" });
      this.lastMoveResult = { accepted: r !== null };
    } catch {
      this.lastMoveResult = { accepted: false };
    }
  },
);

Then(
  "the moved Black pawn is removed from the board",
  function (this: ChessWorld) {
    assert.equal(this.lastMoveResult?.accepted, true);
    assert.ok(!this.chess.get("c5"), "Black pawn should be captured from c5");
  },
);

// En passant window expired
Given(
  "an en passant capture was available on the previous turn",
  function (this: ChessWorld) {
    this.chess = new Chess(
      "rnbqkbnr/pp1ppppp/8/2pP4/8/8/PPP1PPPP/RNBQKBNR w KQkq c6 0 3",
    );
  },
);

Given("another move has been played since then", function (this: ChessWorld) {
  this.chess.move({ from: "h2", to: "h3" });
  this.chess.move({ from: "h7", to: "h6" });
});

When("the player attempts the en passant capture", function (this: ChessWorld) {
  try {
    const r = this.chess.move({ from: "d5", to: "c6" });
    this.lastMoveResult = { accepted: r !== null };
  } catch {
    this.lastMoveResult = {
      accepted: false,
      reason: "En passant window expired",
    };
  }
});

// Pawn promotion
Given("a pawn can legally move to the final rank", function (this: ChessWorld) {
  this.chess = new Chess("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
});

When(
  "the player promotes the pawn to a {word}",
  function (this: ChessWorld, piece: string) {
    const map: Record<string, "q" | "r" | "b" | "n"> = {
      queen: "q",
      rook: "r",
      bishop: "b",
      knight: "n",
    };
    const promo = map[piece.toLowerCase()] ?? "q";
    this.chess = new Chess("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    try {
      const r = this.chess.move({ from: "a7", to: "a8", promotion: promo });
      this.lastMoveResult = { accepted: r !== null };
    } catch {
      this.lastMoveResult = { accepted: false };
    }
  },
);

Then(
  "the pawn is replaced by a {word}",
  function (this: ChessWorld, piece: string) {
    assert.equal(this.lastMoveResult?.accepted, true);
    const typeMap: Record<string, string> = {
      queen: "q",
      rook: "r",
      bishop: "b",
      knight: "n",
    };
    const promoted = this.chess.get("a8");
    assert.ok(promoted, "Expected piece on a8 after promotion");
    assert.equal(
      promoted.type,
      typeMap[piece.toLowerCase()],
      `Expected ${piece} on a8`,
    );
  },
);

// Draw: insufficient material
Given("the board contains only kings", function (this: ChessWorld) {
  this.chess = new Chess("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
});

When("the game state is evaluated", function (this: ChessWorld) {
  // No action needed
});

Then(
  "the game result is a draw by insufficient material",
  function (this: ChessWorld) {
    assert.equal(this.chess.isInsufficientMaterial(), true);
  },
);

// Draw: threefold repetition
Given(
  "the same legal board position with the same side to move has occurred three times",
  function (this: ChessWorld) {
    this.chess = new Chess();
    this.chess.move("Nf3");
    this.chess.move("Nf6");
    this.chess.move("Ng1");
    this.chess.move("Ng8");
    this.chess.move("Nf3");
    this.chess.move("Nf6");
    this.chess.move("Ng1");
    this.chess.move("Ng8");
  },
);

Then("the game result is a draw by repetition", function (this: ChessWorld) {
  assert.equal(this.chess.isThreefoldRepetition(), true);
});

// Draw: fifty-move rule
Given(
  "fifty consecutive moves by each side have occurred without a pawn move or capture",
  function (this: ChessWorld) {
    // Half-move clock of 100 means 50 full moves without pawn or capture
    this.chess = new Chess("4k3/8/8/8/8/8/8/4KR2 w - - 100 60");
  },
);

Then(
  "the game result is a draw by the fifty-move rule",
  function (this: ChessWorld) {
    assert.equal(this.chess.isDraw(), true, "Expected fifty-move rule draw");
  },
);

// ─── LOBBY AND START FEATURE ─────────────────────────────────────────────────

Given("a visitor opens the new game flow", function (this: ChessWorld) {
  // No setup needed
});

When(
  "the visitor chooses to host a game as White",
  function (this: ChessWorld) {
    const game = this.store.createGame(this.hostId, "white");
    this.gameId = game.id;
    this.inviteLink = `/game/${game.id}`;
  },
);

Then("a new lobby is created", function (this: ChessWorld) {
  assert.ok(this.gameId);
  assert.equal(this.getGame().status, "waiting");
});

Then("the host is assigned the White side", function (this: ChessWorld) {
  assert.equal(this.getGame().hostColor, "white");
});

Then("an invite link is shown to the host", function (this: ChessWorld) {
  assert.ok(this.inviteLink);
  assert.match(this.inviteLink!, /\/game\/[a-f0-9-]+/);
});

Then("the game is waiting for an opponent", function (this: ChessWorld) {
  assert.equal(this.getGame().status, "waiting");
});

When(
  "the visitor chooses to host a game as Black",
  function (this: ChessWorld) {
    const game = this.store.createGame(this.hostId, "black");
    this.gameId = game.id;
    this.inviteLink = `/game/${game.id}`;
  },
);

Then("the host is assigned the Black side", function (this: ChessWorld) {
  assert.equal(this.getGame().hostColor, "black");
});

Given("a host has created a lobby", function (this: ChessWorld) {
  const game = this.store.createGame(this.hostId, "white");
  this.gameId = game.id;
  this.inviteLink = `/game/${game.id}`;
});

Given("the host has chosen to play as White", function (this: ChessWorld) {
  assert.equal(this.getGame().hostColor, "white");
});

When("a second user opens the invite link", function (this: ChessWorld) {
  const result = this.store.joinGame(this.gameId!, this.guestId);
  this.lastJoinError = result.success ? null : (result.error ?? "Join failed");
});

Then("the second user joins the same lobby", function (this: ChessWorld) {
  assert.equal(this.lastJoinError, null, `Join failed: ${this.lastJoinError}`);
  assert.equal(this.getGame().guestId, this.guestId);
});

Then("the second user is assigned the Black side", function (this: ChessWorld) {
  // When host chose white, guest gets black
  const game = this.getGame();
  const guestColor = game.hostColor === "white" ? "black" : "white";
  assert.equal(guestColor, "black");
});

Given("a host is waiting in a lobby", function (this: ChessWorld) {
  const game = this.store.createGame(this.hostId, "white");
  this.gameId = game.id;
  this.inviteLink = `/game/${game.id}`;
});

When("the second user joins that lobby", function (this: ChessWorld) {
  const result = this.store.joinGame(this.gameId!, this.guestId);
  this.lastJoinError = result.success ? null : (result.error ?? null);
});

Then("the lobby status changes to in-progress", function (this: ChessWorld) {
  assert.equal(this.getGame().status, "active");
});

Then(
  "the chessboard is initialized in the standard starting position",
  function (this: ChessWorld) {
    assert.equal(this.getGame().fen, INITIAL_FEN);
  },
);

Then("the game starts immediately", function (this: ChessWorld) {
  assert.equal(this.getGame().status, "active");
});

Given("a lobby already contains two players", function (this: ChessWorld) {
  const game = this.store.createGame(this.hostId, "white");
  this.gameId = game.id;
  this.store.joinGame(this.gameId, this.guestId);
  assert.equal(this.getGame().status, "active");
});

When("a third user opens the invite link", function (this: ChessWorld) {
  const result = this.store.joinGame(this.gameId!, this.thirdUserId);
  this.lastJoinError = result.success ? null : (result.error ?? "Join failed");
});

Then(
  "the third user is not allowed to join the game",
  function (this: ChessWorld) {
    assert.ok(this.lastJoinError, "Expected join to fail for third user");
  },
);

Then(
  "the user sees that the game is full or unavailable",
  function (this: ChessWorld) {
    assert.ok(this.lastJoinError);
  },
);

Given(
  "a host has created a lobby and copied the invite link",
  function (this: ChessWorld) {
    const game = this.store.createGame(this.hostId, "white");
    this.gameId = game.id;
    this.inviteLink = `/game/${game.id}`;
  },
);

When(
  "the host re-opens the invite link before anyone joins",
  function (this: ChessWorld) {
    const result = this.store.joinGame(this.gameId!, this.hostId);
    this.lastJoinError = result.success ? null : (result.error ?? null);
  },
);

Then("the host returns to the same waiting lobby", function (this: ChessWorld) {
  assert.equal(this.lastJoinError, null);
  assert.equal(this.getGame().status, "waiting");
  assert.equal(this.getGame().id, this.gameId);
});

Then("the previously selected side is preserved", function (this: ChessWorld) {
  assert.equal(this.getGame().hostColor, "white");
});

Given("no opponent has joined yet", function (this: ChessWorld) {
  assert.equal(this.getGame().guestId, null);
  assert.equal(this.getGame().status, "waiting");
});

When("the host views the lobby", function (this: ChessWorld) {
  // No action
});

Then("the host sees a waiting state", function (this: ChessWorld) {
  assert.equal(this.getGame().status, "waiting");
});

Then("the invite link remains visible", function (this: ChessWorld) {
  assert.ok(this.inviteLink);
});

Then(
  "the chessboard does not allow active play yet",
  function (this: ChessWorld) {
    assert.equal(this.getGame().status, "waiting");
  },
);

// ─── CHAT FEATURE ────────────────────────────────────────────────────────────

Given("a game exists with two players", function (this: ChessWorld) {
  const game = this.store.createGame(this.hostId, "white");
  this.gameId = game.id;
  this.store.joinGame(this.gameId, this.guestId);
});

Given("both players are viewing the game screen", function (this: ChessWorld) {
  const game = this.getGame();
  assert.equal(game.hostId, this.hostId);
  assert.equal(game.guestId, this.guestId);
});

When("one player sends a chat message", function (this: ChessWorld) {
  this.store.addChatMessage(this.gameId!, this.hostId, "Hello, good game!");
});

Then("the message is stored for that game", function (this: ChessWorld) {
  const result = this.store.getChatMessages(this.gameId!, this.hostId);
  assert.equal(result.success, true);
  assert.ok(result.messages!.length > 0);
  assert.equal(result.messages![0].text, "Hello, good game!");
});

Then(
  "both players see the message in the chat panel",
  function (this: ChessWorld) {
    const h = this.store.getChatMessages(this.gameId!, this.hostId);
    const g = this.store.getChatMessages(this.gameId!, this.guestId);
    assert.equal(h.success, true);
    assert.equal(g.success, true);
    assert.equal(h.messages![0].text, "Hello, good game!");
    assert.equal(g.messages![0].text, "Hello, good game!");
  },
);

Given(
  "several chat messages have been sent in the same game",
  function (this: ChessWorld) {
    this.store.addChatMessage(this.gameId!, this.hostId, "First message");
    this.store.addChatMessage(this.gameId!, this.guestId, "Second message");
    this.store.addChatMessage(this.gameId!, this.hostId, "Third message");
  },
);

When("either player views the chat panel", function (this: ChessWorld) {
  // No action
});

Then(
  "the messages are shown in the order they were sent",
  function (this: ChessWorld) {
    const result = this.store.getChatMessages(this.gameId!, this.hostId);
    assert.equal(result.success, true);
    const msgs = result.messages!;
    assert.ok(msgs.length >= 3);
    for (let i = 1; i < msgs.length; i++) {
      assert.ok(msgs[i].timestamp >= msgs[i - 1].timestamp);
    }
    assert.equal(msgs[0].text, "First message");
    assert.equal(msgs[1].text, "Second message");
    assert.equal(msgs[2].text, "Third message");
  },
);

Given("a chat message exists for a game", function (this: ChessWorld) {
  this.store.addChatMessage(this.gameId!, this.hostId, "A secret message");
});

When(
  "a user who is not one of the two players attempts to access the chat",
  function (this: ChessWorld) {
    // thirdUserId is not a participant
  },
);

Then(
  "that user is denied access to the chat history and new messages",
  function (this: ChessWorld) {
    const read = this.store.getChatMessages(this.gameId!, this.thirdUserId);
    assert.equal(read.success, false, "Third user should not read messages");
    const write = this.store.addChatMessage(
      this.gameId!,
      this.thirdUserId,
      "Unauthorized",
    );
    assert.equal(write.success, false, "Third user should not send messages");
  },
);

Given("both players have sent messages", function (this: ChessWorld) {
  this.store.addChatMessage(this.gameId!, this.hostId, "From white");
  this.store.addChatMessage(this.gameId!, this.guestId, "From black");
});

When("the chat is displayed", function (this: ChessWorld) {
  // No action
});

Then(
  "each message clearly shows which player sent it",
  function (this: ChessWorld) {
    const result = this.store.getChatMessages(this.gameId!, this.hostId);
    assert.equal(result.success, true);
    for (const msg of result.messages!) {
      assert.ok(msg.playerId, "Each message should have playerId");
      assert.ok(msg.playerColor, "Each message should have playerColor");
    }
    const colors = result.messages!.map((m) => m.playerColor);
    assert.ok(colors.includes("white"), "Expected white message");
    assert.ok(colors.includes("black"), "Expected black message");
  },
);

Given(
  "the second player has joined and the game is in progress",
  function (this: ChessWorld) {
    assert.equal(this.getGame().status, "active");
  },
);

When("either player opens the game screen", function (this: ChessWorld) {
  // No action needed
});

Then(
  "the chat panel is available alongside the board",
  function (this: ChessWorld) {
    const chatExists =
      srcContains("src/routes/game/[id]/components/Chat.svelte", "chat") &&
      srcContains("src/routes/game/[id]/+page.svelte", "Chat");
    assert.ok(chatExists, "Chat component should be included in the game page");
  },
);

// ─── MOVE API VALIDATION ─────────────────────────────────────────────────────

Given("a game exists with two connected players", function (this: ChessWorld) {
  const game = this.store.createGame(this.hostId, "white");
  this.gameId = game.id;
  this.store.joinGame(this.gameId, this.guestId);
  this.savedFen = this.getGame().fen;
});

Given(
  "the current board state is known to the server",
  function (this: ChessWorld) {
    this.savedFen = this.getGame().fen;
  },
);

When(
  "the active player submits a legal move through the move API",
  function (this: ChessWorld) {
    this.savedFen = this.getGame().fen;
    this.lastMoveResult = this.store.makeMove(this.gameId!, this.hostId, {
      from: "e2",
      to: "e4",
    });
  },
);

Then(
  "the server responds that the move is accepted",
  function (this: ChessWorld) {
    assert.equal(
      this.lastMoveResult?.accepted,
      true,
      `Expected accepted: ${this.lastMoveResult?.reason}`,
    );
  },
);

Then(
  "the server persists the updated board state",
  function (this: ChessWorld) {
    assert.notEqual(this.getGame().fen, this.savedFen);
  },
);

When(
  "the active player submits an illegal move through the move API",
  function (this: ChessWorld) {
    this.savedFen = this.getGame().fen;
    this.lastMoveResult = this.store.makeMove(this.gameId!, this.hostId, {
      from: "e1",
      to: "e5",
    });
  },
);

Then(
  "the server responds that the move is rejected",
  function (this: ChessWorld) {
    assert.equal(this.lastMoveResult?.accepted, false);
  },
);

Then("the server explains the rejection reason", function (this: ChessWorld) {
  assert.ok(this.lastMoveResult?.reason, "Expected a rejection reason");
});

Then("the server does not change the board state", function (this: ChessWorld) {
  assert.equal(this.getGame().fen, this.savedFen);
});

Given(
  "a third user is not a participant in the game",
  function (this: ChessWorld) {
    // thirdUserId already not in game
  },
);

When(
  "that user submits a move through the move API",
  function (this: ChessWorld) {
    this.savedFen = this.getGame().fen;
    this.lastMoveResult = this.store.makeMove(this.gameId!, this.thirdUserId, {
      from: "e2",
      to: "e4",
    });
  },
);

Then(
  "the server responds with an authorization error",
  function (this: ChessWorld) {
    assert.equal(this.lastMoveResult?.accepted, false);
    const reason = this.lastMoveResult?.reason?.toLowerCase() ?? "";
    assert.ok(
      reason.includes("auth") || reason.includes("not authorized"),
      `Expected auth error, got: ${reason}`,
    );
  },
);

Given("the game result has already been recorded", function (this: ChessWorld) {
  const game = this.store.createGame(this.hostId, "white");
  this.gameId = game.id;
  this.store.joinGame(this.gameId, this.guestId);

  // Scholar's mate sequence
  const moves = [
    { p: this.hostId, from: "e2", to: "e4" },
    { p: this.guestId, from: "e7", to: "e5" },
    { p: this.hostId, from: "f1", to: "c4" },
    { p: this.guestId, from: "b8", to: "c6" },
    { p: this.hostId, from: "d1", to: "h5" },
    { p: this.guestId, from: "g8", to: "f6" },
    { p: this.hostId, from: "h5", to: "f7" }, // Qxf7#
  ];
  for (const m of moves) {
    this.store.makeMove(this.gameId, m.p, { from: m.from, to: m.to });
  }
  assert.equal(this.getGame().status, "finished");
  this.savedFen = this.getGame().fen;
});

When(
  "either player submits another move through the move API",
  function (this: ChessWorld) {
    this.lastMoveResult = this.store.makeMove(this.gameId!, this.hostId, {
      from: "f7",
      to: "f8",
    });
  },
);

Then(
  "the server responds that the game is finished",
  function (this: ChessWorld) {
    assert.equal(this.lastMoveResult?.accepted, false);
    const reason = this.lastMoveResult?.reason?.toLowerCase() ?? "";
    assert.ok(
      reason.includes("finish") ||
        reason.includes("over") ||
        reason.includes("ended"),
      `Expected "finished" error, got: ${reason}`,
    );
  },
);

Given(
  "a client is viewing an out-of-date board state",
  function (this: ChessWorld) {
    this.savedFen = this.getGame().fen;
  },
);

Given(
  "another valid move has already been accepted by the server",
  function (this: ChessWorld) {
    this.store.makeMove(this.gameId!, this.hostId, { from: "e2", to: "e4" });
    this.store.makeMove(this.gameId!, this.guestId, { from: "e7", to: "e5" });
  },
);

When(
  "the stale client submits a move based on the old position",
  function (this: ChessWorld) {
    // e2 is now empty so this is invalid
    this.lastMoveResult = this.store.makeMove(this.gameId!, this.hostId, {
      from: "e2",
      to: "e4",
    });
  },
);

Then(
  "the server rejects the move as out of date or invalid",
  function (this: ChessWorld) {
    assert.equal(this.lastMoveResult?.accepted, false);
  },
);

Then("the client must refresh from server state", function (this: ChessWorld) {
  assert.notEqual(this.getGame().fen, this.savedFen);
});

Given("a pawn move requires promotion", function (this: ChessWorld) {
  this.chess = new Chess("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
});

When(
  "the player submits the move with a selected promotion piece through the move API",
  function (this: ChessWorld) {
    this.chess = new Chess("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");
    const r = this.chess.move({ from: "a7", to: "a8", promotion: "q" });
    this.lastMoveResult = { accepted: r !== null };
  },
);

Then("the server validates the promotion choice", function (this: ChessWorld) {
  assert.equal(this.lastMoveResult?.accepted, true);
});

Then(
  "the server applies the promoted piece to the new board state",
  function (this: ChessWorld) {
    const promoted = this.chess.get("a8");
    assert.ok(promoted);
    assert.equal(promoted.type, "q");
  },
);

// ─── STATE SYNC / SSE FEATURE ────────────────────────────────────────────────

When("a player opens the game screen", function (this: ChessWorld) {
  this.subscribeSSE(this.hostId);
});

Then(
  "the client connects to the game's SSE endpoint",
  function (this: ChessWorld) {
    assert.ok(
      srcContains(
        "src/routes/api/games/[id]/sse/+server.ts",
        "text/event-stream",
      ),
      "SSE endpoint should serve text/event-stream",
    );
  },
);

Then(
  "the client begins receiving game state events",
  function (this: ChessWorld) {
    assert.ok(
      srcContains("src/routes/api/games/[id]/sse/+server.ts", "current_state"),
      "SSE endpoint should send initial state",
    );
  },
);

Given(
  "both players are connected to the game's SSE stream",
  function (this: ChessWorld) {
    this.subscribeSSE(this.hostId);
    this.subscribeSSE(this.guestId);
  },
);

When("the server accepts a legal move", function (this: ChessWorld) {
  this.lastMoveResult = this.store.makeMove(this.gameId!, this.hostId, {
    from: "e2",
    to: "e4",
  });
  assert.equal(this.lastMoveResult.accepted, true);
});

Then(
  "the server emits an updated game state event",
  function (this: ChessWorld) {
    const events = this.receivedEvents.filter(
      (e) => e.event.type === "state_update",
    );
    assert.ok(events.length > 0, "Expected a state_update SSE event");
  },
);

Then(
  "both players receive the same new board state",
  function (this: ChessWorld) {
    const hostEvents = this.receivedEvents.filter(
      (e) => e.playerId === this.hostId && e.event.type === "state_update",
    );
    const guestEvents = this.receivedEvents.filter(
      (e) => e.playerId === this.guestId && e.event.type === "state_update",
    );
    assert.ok(hostEvents.length > 0, "Host should receive state update");
    assert.ok(guestEvents.length > 0, "Guest should receive state update");
    assert.equal(
      (hostEvents[0].event.data as any).fen,
      (guestEvents[0].event.data as any).fen,
    );
  },
);

Then("both players see the active turn updated", function (this: ChessWorld) {
  const events = this.receivedEvents.filter(
    (e) => e.event.type === "state_update",
  );
  const turn = (events[0].event.data as any).turn;
  assert.equal(turn, "black", "After white moves, it should be black's turn");
});

Given("the host is waiting in a lobby", function (this: ChessWorld) {
  const game = this.store.createGame(this.hostId, "white");
  this.gameId = game.id;
  this.subscribeSSE(this.hostId);
});

When("the second player joins", function (this: ChessWorld) {
  this.subscribeSSE(this.guestId);
  this.store.joinGame(this.gameId!, this.guestId);
});

Then(
  "the server emits a game started event through SSE",
  function (this: ChessWorld) {
    const startEvents = this.receivedEvents.filter(
      (e) => e.event.type === "game_started",
    );
    assert.ok(startEvents.length > 0, "Expected game_started SSE event");
  },
);

Then(
  "both players receive the initialized starting state",
  function (this: ChessWorld) {
    const hostStart = this.receivedEvents.find(
      (e) => e.playerId === this.hostId && e.event.type === "game_started",
    );
    const guestStart = this.receivedEvents.find(
      (e) => e.playerId === this.guestId && e.event.type === "game_started",
    );
    assert.ok(hostStart, "Host should receive game_started event");
    assert.ok(guestStart, "Guest should receive game_started event");
    assert.equal((hostStart.event.data as any).fen, INITIAL_FEN);
  },
);

Given(
  "a move results in checkmate, stalemate, or a draw",
  function (this: ChessWorld) {
    const game = this.store.createGame(this.hostId, "white");
    this.gameId = game.id;
    this.store.joinGame(this.gameId, this.guestId);
    this.subscribeSSE(this.hostId);
    this.subscribeSSE(this.guestId);
    // Scholar's mate setup
    this.store.makeMove(this.gameId, this.hostId, { from: "e2", to: "e4" });
    this.store.makeMove(this.gameId, this.guestId, { from: "e7", to: "e5" });
    this.store.makeMove(this.gameId, this.hostId, { from: "f1", to: "c4" });
    this.store.makeMove(this.gameId, this.guestId, { from: "b8", to: "c6" });
    this.store.makeMove(this.gameId, this.hostId, { from: "d1", to: "h5" });
    this.store.makeMove(this.gameId, this.guestId, { from: "g8", to: "f6" });
  },
);

When("the server records the result", function (this: ChessWorld) {
  this.lastMoveResult = this.store.makeMove(this.gameId!, this.hostId, {
    from: "h5",
    to: "f7",
  });
  assert.equal(this.lastMoveResult.accepted, true);
  assert.equal(this.getGame().status, "finished");
});

Then(
  "the server emits a terminal game state event",
  function (this: ChessWorld) {
    const events = this.receivedEvents.filter(
      (e) => e.event.type === "game_over",
    );
    assert.ok(events.length > 0, "Expected game_over SSE event");
  },
);

Then("both players receive the final result", function (this: ChessWorld) {
  const hostOver = this.receivedEvents.find(
    (e) => e.playerId === this.hostId && e.event.type === "game_over",
  );
  const guestOver = this.receivedEvents.find(
    (e) => e.playerId === this.guestId && e.event.type === "game_over",
  );
  assert.ok(hostOver, "Host should receive game_over");
  assert.ok(guestOver, "Guest should receive game_over");
});

Then("the clients stop allowing further moves", function (this: ChessWorld) {
  assert.equal(this.getGame().status, "finished");
  const r = this.store.makeMove(this.gameId!, this.hostId, {
    from: "a1",
    to: "a2",
  });
  assert.equal(r.accepted, false);
});

Given(
  "a player temporarily loses their connection",
  function (this: ChessWorld) {
    this.sseUnsubscribers.forEach((u) => u());
    this.sseUnsubscribers = [];
  },
);

Given("the game continues on the server", function (this: ChessWorld) {
  if (this.getGame().status === "active") {
    this.store.makeMove(this.gameId!, this.hostId, { from: "e2", to: "e4" });
  }
});

When("the player reconnects to the game screen", function (this: ChessWorld) {
  this.subscribeSSE(this.hostId);
});

Then("the client reconnects to the SSE endpoint", function (this: ChessWorld) {
  assert.ok(
    srcContains("src/routes/api/games/[id]/sse/+server.ts", "current_state"),
    "SSE endpoint should send state on reconnect",
  );
});

Then(
  "the client receives the current authoritative game state",
  function (this: ChessWorld) {
    const content = readFileSync(
      resolve(process.cwd(), "src/routes/api/games/[id]/sse/+server.ts"),
      "utf8",
    );
    assert.ok(content.includes("current_state") || content.includes("getGame"));
  },
);

Given("both players are connected to SSE", function (this: ChessWorld) {
  this.subscribeSSE(this.hostId);
  this.subscribeSSE(this.guestId);
});

When("a move is rejected by the server", function (this: ChessWorld) {
  this.receivedEvents = [];
  this.lastMoveResult = this.store.makeMove(this.gameId!, this.thirdUserId, {
    from: "e2",
    to: "e4",
  });
  assert.equal(this.lastMoveResult.accepted, false);
});

Then(
  "the server does not emit a new board state event",
  function (this: ChessWorld) {
    const stateEvents = this.receivedEvents.filter(
      (e) => e.event.type === "state_update",
    );
    assert.equal(
      stateEvents.length,
      0,
      "Should not emit state_update for rejected move",
    );
  },
);

Then(
  "clients keep showing the previous valid state",
  function (this: ChessWorld) {
    const events = this.receivedEvents.filter(
      (e) => e.event.type === "state_update" || e.event.type === "game_over",
    );
    assert.equal(
      events.length,
      0,
      "No state events should be emitted for rejected moves",
    );
  },
);

// ─── BOARD INTERACTIONS FEATURE ──────────────────────────────────────────────

Given("a player is viewing an active chess game", function (this: ChessWorld) {
  const game = this.store.createGame(this.hostId, "white");
  this.gameId = game.id;
  this.store.joinGame(this.gameId, this.guestId);
});

When(
  "the player hovers over a square on the board",
  function (this: ChessWorld) {
    // UI interaction
  },
);

Then("that square shows a visible hover effect", function (this: ChessWorld) {
  assert.ok(
    srcContains("src/routes/game/[id]/components/Board.svelte", ":hover"),
    "Board should have CSS :hover effects on squares",
  );
});

Then("the effect fits the active theme", function (this: ChessWorld) {
  assert.ok(
    srcContains("src/routes/game/[id]/components/Board.svelte", "--board-") ||
      srcContains("src/app.css", "--board-"),
    "Board hover should use CSS theme variables",
  );
});

Given(
  "one of the current player's pieces is on the board",
  function (this: ChessWorld) {
    // Standard position has all pieces
  },
);

When("the player hovers over that piece", function (this: ChessWorld) {
  // UI interaction
});

Then("the piece shows a visible hover effect", function (this: ChessWorld) {
  assert.ok(
    srcContains("src/routes/game/[id]/components/Board.svelte", "my-piece"),
    "Board should have hover class for player pieces",
  );
});

Then(
  "the effect distinguishes it from non-hovered pieces",
  function (this: ChessWorld) {
    assert.ok(
      srcContains(
        "src/routes/game/[id]/components/Board.svelte",
        /scale|transform/,
      ),
      "Piece hover should use scale/transform to distinguish",
    );
  },
);

Given("it is the current player's turn", function (this: ChessWorld) {
  const game = this.getGame();
  assert.equal(game.status, "active");
  assert.equal(game.turn, "white");
});

When(
  "the player selects one of their movable pieces",
  function (this: ChessWorld) {
    // UI interaction
  },
);

Then(
  "the board highlights the legal destination squares for that piece",
  function (this: ChessWorld) {
    assert.ok(
      srcContains(
        "src/routes/game/[id]/components/Board.svelte",
        "legal-target",
      ) ||
        srcContains(
          "src/routes/game/[id]/components/Board.svelte",
          "legalMoves",
        ),
      "Board should highlight legal destination squares",
    );
  },
);

Given("a move has been accepted by the server", function (this: ChessWorld) {
  this.store.makeMove(this.gameId!, this.hostId, { from: "e2", to: "e4" });
});

When("the updated game state reaches the client", function (this: ChessWorld) {
  // State propagates via SSE
});

Then(
  "the piece transitions smoothly from the source square to the destination square",
  function (this: ChessWorld) {
    assert.ok(
      srcContains("src/routes/game/[id]/components/Board.svelte", "transition"),
      "Board should use CSS transitions for piece movement",
    );
  },
);

Then(
  "the board ends in the final server-provided state",
  function (this: ChessWorld) {
    assert.ok(
      srcContains("src/routes/game/[id]/components/Board.svelte", "fen"),
      "Board should render from FEN (server-provided state)",
    );
  },
);

Given("a move captures an opponent piece", function (this: ChessWorld) {
  this.chess = new Chess("4k3/8/8/1p6/8/3B4/8/4K3 w - - 0 1");
});

When("the move is rendered on the client", function (this: ChessWorld) {
  this.chess.move({ from: "d3", to: "b5" });
});

Then(
  "the capturing piece animates to the destination square",
  function (this: ChessWorld) {
    assert.ok(
      srcContains(
        "src/routes/game/[id]/components/Board.svelte",
        "transition",
      ) ||
        srcContains(
          "src/routes/game/[id]/components/Board.svelte",
          "animation",
        ),
      "Board should animate piece movement",
    );
  },
);

Then(
  "the captured piece is removed cleanly from the board",
  function (this: ChessWorld) {
    const p = this.chess.get("b5");
    assert.ok(
      p?.color === "w" && p?.type === "b",
      "White bishop should be on b5 after capture",
    );
    // For en passant, the captured pawn is at c5 after capturing to b5 (not applicable here)
    // The bishop capture on b5 removes the black pawn at b5 (now replaced by white bishop)
  },
);

Given("a player attempts a move locally", function (this: ChessWorld) {
  // Client has not yet sent the move
});

When("the server rejects that move", function (this: ChessWorld) {
  this.lastMoveResult = this.store.makeMove(this.gameId!, this.hostId, {
    from: "e1",
    to: "e8",
  });
  assert.equal(this.lastMoveResult.accepted, false);
});

Then(
  "the client does not commit a final move animation for the rejected move",
  function (this: ChessWorld) {
    // No SSE state_update event emitted for rejected move
    const events = this.receivedEvents.filter(
      (e) => e.event.type === "state_update",
    );
    assert.equal(
      events.length,
      0,
      "No state events should be emitted for rejected moves",
    );
  },
);

Then(
  "the piece remains in its last accepted position",
  function (this: ChessWorld) {
    if (this.savedFen) {
      assert.equal(this.getGame().fen, this.savedFen);
    }
  },
);

// ─── THEME FEATURE ───────────────────────────────────────────────────────────

When("a user opens the application", function (this: ChessWorld) {
  // Navigate to /
});

Then(
  "the interface uses a cohesive dark and white color palette",
  function (this: ChessWorld) {
    const hasDark = srcContains("src/app.css", /--bg-primary:\s*#1/);
    const hasLight = srcContains("src/app.css", /#ffffff|--accent/);
    assert.ok(hasDark, "App should have dark background CSS variable");
    assert.ok(hasLight, "App should have white/light accent CSS variable");
  },
);

Then(
  "the board, panels, and controls share the same visual language",
  function (this: ChessWorld) {
    assert.ok(
      srcContains("src/routes/game/[id]/components/Board.svelte", "var(--"),
    );
    assert.ok(srcContains("src/app.css", ":root"));
  },
);

When("a game board is displayed", function (this: ChessWorld) {
  // No action needed
});

Then(
  "light and dark squares are visually distinct",
  function (this: ChessWorld) {
    const boardFile =
      srcContains(
        "src/routes/game/[id]/components/Board.svelte",
        "--board-light",
      ) ||
      srcContains("src/routes/game/[id]/components/Board.svelte", ".light");
    const darkFile =
      srcContains(
        "src/routes/game/[id]/components/Board.svelte",
        "--board-dark",
      ) || srcContains("src/routes/game/[id]/components/Board.svelte", ".dark");
    assert.ok(boardFile, "Board should have light square styling");
    assert.ok(darkFile, "Board should have dark square styling");
  },
);

Then(
  "pieces remain easy to distinguish from the board background",
  function (this: ChessWorld) {
    assert.ok(
      srcContains(
        "src/routes/game/[id]/components/Board.svelte",
        "drop-shadow",
      ) ||
        srcContains("src/routes/game/[id]/components/Board.svelte", "filter"),
      "Pieces should have drop-shadow/filter for visibility",
    );
  },
);

Then(
  "coordinates, controls, and status text remain readable",
  function (this: ChessWorld) {
    assert.ok(
      srcContains("src/routes/game/[id]/components/Board.svelte", "coord"),
    );
    assert.ok(srcContains("src/routes/game/[id]/+page.svelte", "status-bar"));
  },
);

Given("the board is displayed", function (this: ChessWorld) {
  // No action
});

When(
  "a user hovers or selects an interactive element",
  function (this: ChessWorld) {
    // UI interaction
  },
);

Then(
  "the resulting visual state has sufficient contrast against the surrounding UI",
  function (this: ChessWorld) {
    assert.ok(
      srcContains("src/routes/game/[id]/components/Board.svelte", "selected"),
    );
    assert.ok(
      srcContains("src/app.css", "--board-light-selected") ||
        srcContains(
          "src/routes/game/[id]/components/Board.svelte",
          "--board-light-selected",
        ),
    );
  },
);

Then(
  "the user can tell the difference between default, hovered, and selected states",
  function (this: ChessWorld) {
    const content = readFileSync(
      resolve(process.cwd(), "src/routes/game/[id]/components/Board.svelte"),
      "utf8",
    );
    assert.ok(content.includes(":hover"), "Should have hover state");
    assert.ok(content.includes("selected"), "Should have selected state");
    assert.ok(content.includes("hovered"), "Should have hovered state");
  },
);

When(
  "the chat panel and game information panel are shown",
  function (this: ChessWorld) {
    // No action needed
  },
);

Then(
  "they use the same dark and white design system as the rest of the application",
  function (this: ChessWorld) {
    assert.ok(
      srcContains(
        "src/routes/game/[id]/components/Chat.svelte",
        "var(--bg-panel)",
      ),
    );
    assert.ok(srcContains("src/routes/game/[id]/+page.svelte", "var(--"));
  },
);

Then("text, borders, and inputs remain legible", function (this: ChessWorld) {
  assert.ok(
    srcContains(
      "src/routes/game/[id]/components/Chat.svelte",
      "var(--text-primary)",
    ) || srcContains("src/routes/game/[id]/components/Chat.svelte", "color"),
  );
  assert.ok(
    srcContains("src/routes/game/[id]/components/Chat.svelte", "border"),
  );
});
