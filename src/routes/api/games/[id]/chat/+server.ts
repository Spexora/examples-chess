import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types.js";
import { store } from "$lib/server/store.js";

export const GET: RequestHandler = async ({ params, cookies }) => {
  const playerId = cookies.get("playerId");
  if (!playerId) throw error(401, "Not authenticated");

  const result = store.getChatMessages(params.id, playerId);
  if (!result.success) throw error(403, result.error ?? "Access denied");

  return json({ messages: result.messages });
};

export const POST: RequestHandler = async ({ params, request, cookies }) => {
  const playerId = cookies.get("playerId");
  if (!playerId) throw error(401, "Not authenticated");

  const body = await request.json();
  const result = store.addChatMessage(params.id, playerId, body.text ?? "");

  if (!result.success) throw error(403, result.error ?? "Access denied");

  return json({ message: result.message });
};
