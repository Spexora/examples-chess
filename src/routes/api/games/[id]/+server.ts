import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { store } from "$lib/server/store.js";

export const GET: RequestHandler = async ({ params }) => {
  const game = store.getGame(params.id);
  if (!game) throw error(404, "Game not found");
  return json(game);
};
