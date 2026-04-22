import { error, redirect } from "@sveltejs/kit";
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

  // ── Host-token redirect ──────────────────────────────────────────────────
  // After game creation, the home page navigates to /game/:id?h=<hostId>.
  // We validate the token here, set the playerId cookie in the response
  // headers, and redirect to the clean /game/:id URL.
  //
  // The browser processes Set-Cookie headers from HTTP redirect responses
  // BEFORE it follows the redirect, so the cookie is guaranteed to be present
  // on every subsequent request — including the load triggered by the
  // redirect.  This is reliable on localhost AND on LAN/IP addresses, because
  // it relies on the HTTP specification rather than on `fetch` cookie timing.
  const hostToken = url.searchParams.get("h");
  if (hostToken && hostToken === game.hostId) {
    cookies.set("playerId", game.hostId, COOKIE_OPTS);
    throw redirect(302, `/game/${params.id}`);
  }

  // ── Normal visitor ───────────────────────────────────────────────────────
  let playerId = cookies.get("playerId") ?? null;

  if (!playerId) {
    // New visitor (guest arriving via invite link) — assign a fresh identity.
    playerId = crypto.randomUUID();
  }

  // Always (re-)set the cookie so it stays fresh on every visit.
  cookies.set("playerId", playerId, COOKIE_OPTS);

  const isHost = game.hostId === playerId;
  const isGuest = game.guestId === playerId;
  const isParticipant = isHost || isGuest;

  // If not a participant and the game is already full/finished, show an info page.
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
