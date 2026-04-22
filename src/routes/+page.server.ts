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
    redirect(303, `/game/${game.id}`);
  },
};
