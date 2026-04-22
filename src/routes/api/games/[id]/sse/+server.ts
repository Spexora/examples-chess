import type { RequestHandler } from "./$types.js";
import { store } from "$lib/server/store.js";
import { error } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ params, cookies, url }) => {
  // EventSource does not support custom headers, so cookies may not be
  // forwarded reliably in all environments.  Accept the player id from the
  // `pid` query parameter as a trusted fallback (value originates from the
  // server-rendered page data, not from client-controlled input).
  const playerId = cookies.get("playerId") || url.searchParams.get("pid");
  if (!playerId) throw error(401, "Not authenticated");

  const game = store.getGame(params.id);
  if (!game) throw error(404, "Game not found");

  if (game.hostId !== playerId && game.guestId !== playerId) {
    throw error(403, "Not authorized");
  }

  const stream = new ReadableStream({
    start(controller) {
      // Send the current game state immediately on connection
      const initialEvent = `data: ${JSON.stringify({ type: "current_state", gameId: game.id, data: game })}\n\n`;
      controller.enqueue(new TextEncoder().encode(initialEvent));

      // Subscribe to future events
      const unsubscribe = store.subscribe(params.id, (event) => {
        try {
          const msg = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(new TextEncoder().encode(msg));
        } catch {
          unsubscribe();
        }
      });

      // Clean up when client disconnects
      return () => {
        unsubscribe();
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
