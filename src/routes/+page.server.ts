import { redirect } from "@sveltejs/kit";
import type { Actions } from "./$types.js";
import { store } from "$lib/server/store.js";

export const actions: Actions = {
  createGame: async ({ request, cookies }) => {
    const data = await request.formData();
    const color: "white" | "black" =
      data.get("color") === "black" ? "black" : "white";

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
    // Include the host's playerId as a ?pid= query parameter so the game
    // page's server-side load function can always identify the host even when
    // SvelteKit's client-side router follows the redirect before the
    // Set-Cookie header from this response is committed to the browser's
    // cookie store (a race that occurs reliably when the server is accessed
    // via a LAN/IP address rather than localhost).
    redirect(303, `/game/${game.id}?pid=${hostId}`);
  },
};
