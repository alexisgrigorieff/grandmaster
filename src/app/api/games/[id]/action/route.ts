import { z } from "zod";
import { applyAction } from "@/lib/chess/engine";
import { authenticate } from "@/lib/server/auth";
import { commitPatch, json, loadGame, loadUsernames, opponentLastSeen } from "@/lib/server/games";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { GameRow } from "@/lib/chess/types";

export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum([
    "resign",
    "offer_draw",
    "accept_draw",
    "decline_draw",
    "claim_draw",
    "abort",
    "flag",
    "claim_abandonment",
    "offer_rematch",
    "accept_rematch",
    "decline_rematch",
    "cancel_rematch",
  ]),
});

const SQL_ERRORS: Record<string, [number, string]> = {
  PLAYER_BUSY: [409, "One of you is already playing another game."],
  NO_REMATCH_OFFER: [409, "There is no rematch offer to accept."],
  REMATCH_EXPIRED: [409, "That rematch offer has expired."],
  GAME_NOT_OVER: [409, "The game is still in progress."],
  GAME_NOT_FOUND: [404, "Game not found."],
};

export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/action">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return json({ error: "BAD_ID", message: "Unknown game." }, 404);

  // JSON only: blocks simple cross-site form posts (CSRF) against the cookie session.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "BAD_CONTENT_TYPE", message: "Expected JSON." }, 415);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== process.env.NEXT_PUBLIC_SITE_URL) {
    return json({ error: "BAD_ORIGIN", message: "Cross-site request refused." }, 403);
  }

  const userId = await authenticate(request);
  if (!userId) return json({ error: "UNAUTHENTICATED", message: "Please sign in." }, 401);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "BAD_REQUEST", message: "Unknown action." }, 400);
  const { action } = parsed.data;

  const game = await loadGame(id);
  if (!game || (game.white_id !== userId && game.black_id !== userId)) {
    return json({ error: "NOT_FOUND", message: "Game not found." }, 404);
  }

  if (action === "accept_rematch") {
    const { data, error } = await getAdminSupabase().rpc("accept_rematch", { p_game: id, p_user: userId });
    if (error) {
      const code = Object.keys(SQL_ERRORS).find((k) => error.message.includes(k));
      const [status, message] = code ? SQL_ERRORS[code] : [500, "Could not start the rematch."];
      return json({ error: code ?? "REMATCH_FAILED", message, game }, status);
    }
    const rematch = data as GameRow;
    return json({ game: await loadGame(id), rematch, event: "rematch_started", serverNow: Date.now() });
  }

  const now = Date.now();
  const opponentId = game.white_id === userId ? game.black_id : game.white_id;
  const [names, lastSeen] = await Promise.all([
    loadUsernames(game),
    action === "claim_abandonment" ? opponentLastSeen(id, opponentId) : Promise.resolve(null),
  ]);

  const result = applyAction(game, userId, action, now, { names, opponentLastSeen: lastSeen });
  if (!result.ok) return json({ error: result.code, message: result.message, game, serverNow: now }, result.status);

  const updated = await commitPatch(game, result.patch);
  if (!updated) {
    const fresh = await loadGame(id);
    return json({ error: "CONFLICT", message: "The game changed. Syncing…", game: fresh, serverNow: Date.now() }, 409);
  }
  return json({ game: updated, event: result.event, serverNow: Date.now() });
}
