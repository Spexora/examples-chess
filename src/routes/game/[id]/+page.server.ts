import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";
import { store } from "$lib/server/store.js";

export const load: PageServerLoad = async ({ params, cookies, url }) => {
  const game = store.getGame(params.id);
  if (!game) throw error(404, "Game not found");

  // Prefer the cookie.  Fall back to the ?pid= query parameter, which is
  // included in the redirect URL from the game-creation form action to
  // guarantee the host is correctly identified even when SvelteKit's
  // client-side router follows the redirect before the Set-Cookie from the
  // action response is committed to the browser's cookie store.
  let playerId = cookies.get("playerId") ?? url.searchParams.get("pid") ?? null;

  if (!playerId) {
    // Completely new visitor — assign a fresh identity.
    playerId = crypto.randomUUID();
  }

  // Always (re-)set the cookie so the browser's jar is up to date regardless
  // of whether we read the id from the cookie or from the URL parameter.
  cookies.set("playerId", playerId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });

  const isHost = game.hostId === playerId;
  const isGuest = game.guestId === playerId;
  const isParticipant = isHost || isGuest;

  // Auto-join if not already a participant and game is waiting
  if (!isParticipant && game.status !== "waiting") {
    // Game is full - return a "full" state so UI can show error
    return { game, playerId, isFull: true };
  }

  // Join if arriving via invite and not yet a participant
  if (!isParticipant && game.status === "waiting") {
    const result = store.joinGame(params.id, playerId);
    if (!result.success) {
      return { game, playerId, isFull: true };
    }
    return { game: result.game!, playerId, isFull: false };
  }

  return { game, playerId, isFull: false };
};
