import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { store } from "$lib/server/store.js";

const COOKIE_OPTS = {
  path: "/",
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 7,
};

export const POST: RequestHandler = async ({ params, cookies, request }) => {
  // Accept identity from:
  //   1. Existing cookie (returning participant, most common case)
  //   2. X-Player-Id header (identity recovery — cookie was lost but client
  //      has the playerId stored in sessionStorage and sends it as a header)
  //   3. Neither → generate a fresh UUID for a new guest
  const cookieId = cookies.get("playerId");
  const headerId = request.headers.get("x-player-id");
  const playerId = cookieId ?? headerId ?? crypto.randomUUID();

  // Always (re-)commit the cookie so subsequent move/chat requests work.
  cookies.set("playerId", playerId, COOKIE_OPTS);

  const result = store.joinGame(params.id, playerId);
  if (!result.success) {
    throw error(403, result.error ?? "Cannot join game");
  }

  return json({
    playerId,
    game: result.game,
    alreadyHost: result.alreadyHost,
    alreadyGuest: result.alreadyGuest,
  });
};
