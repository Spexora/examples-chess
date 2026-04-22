import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { store } from "$lib/server/store.js";

export const POST: RequestHandler = async ({ params, cookies }) => {
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
