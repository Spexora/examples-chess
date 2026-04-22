import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";
import { store } from "$lib/server/store.js";

const COOKIE_OPTS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 7,
};

export const load: PageServerLoad = async ({ params, cookies, url }) => {
  const game = store.getGame(params.id);
  if (!game) throw error(404, "Game not found");

  // ── Player identity resolution ───────────────────────────────────────────
  //
  // Priority order:
  //   1. Valid ?h=<hostId> token  →  identify as host immediately.
  //   2. Existing playerId cookie  →  returning visitor.
  //   3. Neither                  →  new visitor (potential guest), assign UUID.
  //
  // IMPORTANT — no redirect is used here.  We set the cookie directly in the
  // headers of THIS response (the actual page response, not a 3xx redirect).
  // Browsers always process Set-Cookie headers before executing any
  // JavaScript, which makes this 100 % reliable on localhost and LAN/IP
  // addresses alike.  Redirect-based cookie delivery can lose a race against
  // SvelteKit's client-side router or the browser Navigation API, which is
  // what caused the "directly in game, no lobby" bug on LAN.
  const hostToken = url.searchParams.get("h");
  let playerId: string;

  if (hostToken && hostToken === game.hostId) {
    // Valid host token — treat this visitor as the host.
    playerId = game.hostId;
  } else {
    // Returning visitor or brand-new visitor.
    playerId = cookies.get("playerId") ?? crypto.randomUUID();
  }

  // Commit the identity to the cookie store for this response.
  cookies.set("playerId", playerId, COOKIE_OPTS);

  const isHost = game.hostId === playerId;
  const isGuest = game.guestId === playerId;
  const isParticipant = isHost || isGuest;

  // Spectator / late arrival — game is already full or finished.
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
