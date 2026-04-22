import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { store } from "$lib/server/store.js";

export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = await request.json();
  const color: "white" | "black" = body.color === "black" ? "black" : "white";

  // Assign a host player ID via cookie
  let hostId = cookies.get("playerId");
  if (!hostId) {
    hostId = crypto.randomUUID();
    cookies.set("playerId", hostId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  const game = store.createGame(hostId, color);
  return json({ gameId: game.id, hostId, color });
};
