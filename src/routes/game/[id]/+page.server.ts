import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";
import { store } from "$lib/server/store.js";

export const load: PageServerLoad = async ({ params, cookies }) => {
  const game = store.getGame(params.id);
  if (!game) throw error(404, "Game not found");

  // Read the player identity from the cookie.  The cookie is set either:
  //   1. When the host created the game (via POST /api/games), or
  //   2. When a guest first visited this page (set below).
  // We no longer fall back to a ?pid= query parameter — the cookie is always
  // reliably present because the home page uses `fetch` + `window.location.href`
  // for game creation, which guarantees the Set-Cookie is committed to the
  // browser's jar before this load function runs.
  let playerId = cookies.get("playerId") ?? null;

  if (!playerId) {
    // New visitor (guest arriving via invite link) — assign a fresh identity.
    playerId = crypto.randomUUID();
  }

  // Always (re-)set the cookie so it stays fresh on every visit.
  cookies.set("playerId", playerId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });

  const isHost = game.hostId === playerId;
  const isGuest = game.guestId === playerId;
  const isParticipant = isHost || isGuest;

  // If not a participant and the game is already running, show a "full" page.
  if (!isParticipant && game.status !== "waiting") {
    return { game, playerId, isFull: true };
  }

  // New guest arriving via invite link — auto-join.
  if (!isParticipant && game.status === "waiting") {
    const result = store.joinGame(params.id, playerId);
    if (!result.success) {
      return { game, playerId, isFull: true };
    }
    return { game: result.game!, playerId, isFull: false };
  }

  return { game, playerId, isFull: false };
};
