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
  // Priority:
  //   1. Valid ?h=<hostId> token  →  identify as host, set cookie.
  //   2. Existing valid cookie (must match a participant)  →  returning visitor.
  //   3. Neither  →  unknown visitor (playerId = null).
  //
  // IMPORTANT: we never auto-join here.  Joining is done client-side in
  // onMount via POST /api/games/:id/join.  This avoids the race where a
  // second server-side load (e.g. from SvelteKit's client router following a
  // same-origin navigation) runs without the ?h= token and incorrectly joins
  // the host as a guest — which was the root cause of "directly in game, no
  // lobby" on LAN/IP addresses.
  const hostToken = url.searchParams.get("h");
  let playerId: string | null = null;

  if (hostToken && hostToken === game.hostId) {
    // Valid host token — identify as host and commit the cookie.
    playerId = game.hostId;
    cookies.set("playerId", playerId, COOKIE_OPTS);
  } else {
    const cookieId = cookies.get("playerId");
    if (cookieId && (game.hostId === cookieId || game.guestId === cookieId)) {
      // Returning participant with a valid cookie.
      playerId = cookieId;
    }
    // Unknown visitor: playerId stays null.
    // The client will call POST /api/games/:id/join in onMount.
  }

  // The server can only declare the game "full" when it is certain the visitor
  // is a stranger to an active game.  Unknown visitors to a waiting game are
  // handled client-side (they become the guest).  Unknown visitors to an
  // active game may still be a returning participant whose cookie was lost —
  // the client will attempt identity recovery via sessionStorage before
  // showing "game unavailable".
  const isFull = playerId === null && game.status !== "waiting";

  return { game, playerId, isFull };
};
