import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types.js";
import { store } from "$lib/server/store.js";

export const load: PageServerLoad = async ({ params, cookies, url }) => {
  const game = store.getGame(params.id);
  if (!game) throw error(404, "Game not found");

  let playerId = cookies.get("playerId");
  if (!playerId) {
    playerId = crypto.randomUUID();
    cookies.set("playerId", playerId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

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
