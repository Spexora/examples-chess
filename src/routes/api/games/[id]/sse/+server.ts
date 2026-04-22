import type { RequestHandler } from "./$types.js";
import { store } from "$lib/server/store.js";
import { error } from "@sveltejs/kit";

export const GET: RequestHandler = async ({
  params,
  cookies,
  url,
  request,
}) => {
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

  const encoder = new TextEncoder();

  // These are shared between start() and cancel() via closure.
  let unsubscribe: (() => void) | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  function cleanup() {
    unsubscribe?.();
    unsubscribe = undefined;
    if (heartbeatTimer !== undefined) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string): boolean => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          return true;
        } catch {
          return false;
        }
      };

      // Send the current game state immediately on connection so that a
      // reconnecting client always re-hydrates from the authoritative state.
      send(
        JSON.stringify({
          type: "current_state",
          gameId: game.id,
          data: game,
        }),
      );

      // Subscribe to all future store events for this game.
      unsubscribe = store.subscribe(params.id, (event) => {
        if (!send(JSON.stringify(event))) {
          // Controller is closed — the client has disconnected.
          cleanup();
        }
      });

      // Heartbeat every 25 s.  This does two things:
      //   1. Keeps the TCP connection alive through proxies / load balancers.
      //   2. Forces the HTTP layer to flush its buffers so that game events
      //      that were enqueued slightly earlier are also delivered promptly.
      heartbeatTimer = setInterval(() => {
        if (
          !send(
            JSON.stringify({
              type: "ping",
              gameId: params.id,
              data: {},
            }),
          )
        ) {
          cleanup();
        }
      }, 25_000);
    },

    // cancel() is the correct hook for ReadableStream cleanup — the return
    // value of start() is ignored by the Streams API.
    cancel() {
      cleanup();
    },
  });

  // Also clean up when the HTTP request itself is aborted (client navigates
  // away, closes the tab, etc.).
  request.signal.addEventListener("abort", cleanup, { once: true });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // Tell nginx / other reverse proxies not to buffer this response.
      "X-Accel-Buffering": "no",
    },
  });
};
