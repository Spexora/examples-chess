import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { store } from "$lib/server/store.js";

export const POST: RequestHandler = async ({ params, request, cookies }) => {
  // Accept player identity from cookie (primary) or X-Player-Id header
  // (fallback for environments where cookies are not reliably forwarded to
  // API fetch calls — e.g. LAN/IP addresses in certain browser configurations).
  const playerId =
    cookies.get("playerId") ?? request.headers.get("x-player-id");
  if (!playerId) throw error(401, "Not authenticated");

  const body = await request.json();
  const result = store.makeMove(params.id, playerId, {
    from: body.from,
    to: body.to,
    promotion: body.promotion,
  });

  if (!result.accepted) {
    return json({ accepted: false, reason: result.reason }, { status: 422 });
  }

  return json({ accepted: true, game: result.game });
};
