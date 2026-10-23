import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { GamePatch } from "@/lib/chess/engine";
import type { GameRow } from "@/lib/chess/types";

export async function loadGame(id: string): Promise<GameRow | null> {
  const { data, error } = await getAdminSupabase().from("games").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GameRow | null) ?? null;
}

export async function loadUsernames(game: Pick<GameRow, "white_id" | "black_id">): Promise<{ white: string; black: string }> {
  const { data } = await getAdminSupabase()
    .from("profiles")
    .select("id, username")
    .in("id", [game.white_id, game.black_id]);
  const byId = new Map((data ?? []).map((p: { id: string; username: string }) => [p.id, p.username]));
  return { white: byId.get(game.white_id) ?? "White", black: byId.get(game.black_id) ?? "Black" };
}

/**
 * Atomically apply a patch if, and only if, nobody else has changed the game
 * since we read it (optimistic concurrency on `version`). Returns the new row,
 * or null if we lost the race.
 */
export async function commitPatch(game: GameRow, patch: GamePatch): Promise<GameRow | null> {
  const { data, error } = await getAdminSupabase()
    .from("games")
    .update(patch)
    .eq("id", game.id)
    .eq("version", game.version)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GameRow | null) ?? null;
}

export async function opponentLastSeen(gameId: string, opponentId: string): Promise<number | null> {
  const { data } = await getAdminSupabase()
    .from("game_presence")
    .select("last_seen_at")
    .eq("game_id", gameId)
    .eq("user_id", opponentId)
    .maybeSingle();
  return data?.last_seen_at ? Date.parse(data.last_seen_at) : null;
}

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
