import { z } from "zod";
import { applyMove } from "@/lib/chess/engine";
import { authenticate } from "@/lib/server/auth";
import { commitPatch, json, loadGame, loadUsernames } from "@/lib/server/games";

export const dynamic = "force-dynamic";

const Body = z.object({
  uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
  ply: z.number().int().min(0).max(10_000),
});

/**
 * Submit a move. The server replays the game with chess.js, validates turn,
 * legality and clocks, then writes the new state with compare-and-swap.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/games/[id]/move">) {
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
  if (!parsed.success) return json({ error: "BAD_REQUEST", message: "Malformed move." }, 400);

  const game = await loadGame(id);
  if (!game || (game.white_id !== userId && game.black_id !== userId)) {
    return json({ error: "NOT_FOUND", message: "Game not found." }, 404);
  }

  const names = await loadUsernames(game);
  const now = Date.now();
  const result = applyMove(game, userId, parsed.data, now, { names });
  if (!result.ok) {
    return json({ error: result.code, message: result.message, game, serverNow: now }, result.status);
  }

  const updated = await commitPatch(game, result.patch);
  if (!updated) {
    // Somebody else (the opponent's action, a flag claim…) got there first.
    const fresh = await loadGame(id);
    return json({ error: "CONFLICT", message: "The game changed. Syncing…", game: fresh, serverNow: Date.now() }, 409);
  }
  return json({ game: updated, event: result.event, san: result.san, serverNow: Date.now() });
}
