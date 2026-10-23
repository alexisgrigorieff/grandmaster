/**
 * Integration tests for the server-authoritative game API.
 *
 * Requires a running backend (Supabase project or scripts/local-stack) and the
 * Next.js app:
 *   TEST_APP_URL=http://localhost:3000 TEST_SUPABASE_URL=... TEST_ANON_KEY=... TEST_SERVICE_KEY=... npx vitest run tests/integration
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const APP = process.env.TEST_APP_URL;
const URL_ = process.env.TEST_SUPABASE_URL;
const ANON = process.env.TEST_ANON_KEY;
const SERVICE = process.env.TEST_SERVICE_KEY;
const d = APP && URL_ && ANON && SERVICE ? describe : describe.skip;

interface Player {
  id: string;
  token: string;
  sb: SupabaseClient;
}

const rnd = () => Math.random().toString(36).slice(2, 8);

async function player(name: string): Promise<Player> {
  const sb = createClient(URL_!, ANON!, { auth: { persistSession: false, autoRefreshToken: false } });
  const tag = rnd();
  const { data, error } = await sb.auth.signUp({ email: `${name}_${tag}@example.test`, password: "correct-horse-1", options: { data: { username: `${name}_${tag}` } } });
  if (error || !data.session) throw new Error(`signup failed: ${error?.message ?? "no session (enable autoconfirm)"}`);
  return { id: data.user!.id, token: data.session.access_token, sb };
}

async function api(p: Player | null, gameId: string, path: "move" | "action", body: unknown) {
  const res = await fetch(`${APP}/api/games/${gameId}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(p ? { authorization: `Bearer ${p.token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function newGame(a: Player, b: Player, initialMs: number | null = null, incrementMs = 0) {
  const { data: ch, error } = await a.sb.rpc("create_challenge", { p_to: b.id, p_color: "white", p_initial_ms: initialMs, p_increment_ms: incrementMs, p_rated: true });
  if (error) throw error;
  const { data: acc, error: e2 } = await b.sb.rpc("respond_challenge", { p_challenge: ch.id, p_accept: true });
  if (e2) throw e2;
  return acc.game_id as string;
}

async function finish(a: Player, gameId: string) {
  await api(a, gameId, "action", { action: "resign" });
}

d("game API (live server)", () => {
  let admin: SupabaseClient;
  let alice: Player, bob: Player, carol: Player;

  beforeAll(async () => {
    admin = createClient(URL_!, SERVICE!, { auth: { persistSession: false } });
    [alice, bob, carol] = await Promise.all([player("alice"), player("bob"), player("carol")]);
  });

  afterAll(async () => {
    await Promise.all([alice, bob, carol].map((p) => p?.sb.auth.signOut().catch(() => {})));
  });

  it("plays a full game: legal moves, turn order, checkmate, history", async () => {
    const id = await newGame(alice, bob);
    const seq: [Player, string][] = [
      [alice, "e2e4"],
      [bob, "e7e5"],
      [alice, "f1c4"],
      [bob, "b8c6"],
      [alice, "d1h5"],
      [bob, "g8f6"],
    ];
    for (const [i, [p, uci]] of seq.entries()) {
      const r = await api(p, id, "move", { uci, ply: i });
      expect(r.status, `${uci}: ${JSON.stringify(r.body)}`).toBe(200);
      expect(r.body.game.ply).toBe(i + 1);
    }
    // Out of turn.
    expect((await api(bob, id, "move", { uci: "a7a6", ply: 6 })).body.error).toBe("NOT_YOUR_TURN");
    // Illegal.
    expect((await api(alice, id, "move", { uci: "h5h8", ply: 6 })).status).toBe(422);
    // Stale ply (duplicate / out-of-order).
    expect((await api(alice, id, "move", { uci: "h5f7", ply: 5 })).body.error).toBe("STALE_PLY");
    // Mate.
    const mate = await api(alice, id, "move", { uci: "h5f7", ply: 6 });
    expect(mate.body.game).toMatchObject({ status: "finished", result: "1-0", termination: "checkmate" });
    expect(mate.body.game.pgn).toContain("Qxf7#");
    expect(mate.body.game.pgn).toContain(`[White "${(await alice.sb.from("profiles").select("username").eq("id", alice.id).single()).data!.username}"]`);
    // Saved for both players.
    for (const p of [alice, bob]) {
      const { data } = await p.sb.rpc("profile_games", { p_user: p.id, p_limit: 5 });
      expect(data.some((g: { id: string }) => g.id === id)).toBe(true);
    }
    expect((await api(bob, id, "move", { uci: "a7a6", ply: 7 })).body.error).toBe("GAME_OVER");
  });

  it("accepts exactly one of many identical concurrent submissions", async () => {
    const id = await newGame(alice, bob);
    const results = await Promise.all(Array.from({ length: 6 }, () => api(alice, id, "move", { uci: "d2d4", ply: 0 })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    const { data } = await alice.sb.from("games").select("ply, moves").eq("id", id).single();
    expect(data!.ply).toBe(1);
    expect(data!.moves).toHaveLength(1);
    await finish(alice, id);
  });

  it("rejects conflicting moves from both players at once", async () => {
    const id = await newGame(alice, bob);
    const [a, b] = await Promise.all([api(alice, id, "move", { uci: "e2e4", ply: 0 }), api(bob, id, "move", { uci: "e7e5", ply: 0 })]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(409);
    await finish(alice, id);
  });

  it("keeps other players out", async () => {
    const id = await newGame(alice, bob);
    // RLS: Carol cannot read the game, its chat, or write to it.
    expect((await carol.sb.from("games").select("*").eq("id", id)).data).toEqual([]);
    expect((await carol.sb.from("game_messages").insert({ game_id: id, body: "hi" })).error).toBeTruthy();
    expect((await carol.sb.from("games").update({ status: "finished" }).eq("id", id)).error).toBeTruthy();
    // API: not found for outsiders, unauthorised without a token.
    expect((await api(carol, id, "move", { uci: "e2e4", ply: 0 })).status).toBe(404);
    expect((await api(carol, id, "action", { action: "resign" })).status).toBe(404);
    expect((await api(null, id, "move", { uci: "e2e4", ply: 0 })).status).toBe(401);
    // Garbage input.
    expect((await api(alice, id, "move", { uci: "<script>", ply: 0 })).status).toBe(400);
    expect((await api(alice, "not-a-uuid", "move", { uci: "e2e4", ply: 0 })).status).toBe(404);
    // Players can't even write their own game rows directly.
    expect((await alice.sb.from("games").update({ result: "1-0" }).eq("id", id)).error).toBeTruthy();
    await finish(alice, id);
  });

  it("enforces clocks on the server", async () => {
    const id = await newGame(alice, bob, 60_000, 2_000);
    expect((await api(alice, id, "move", { uci: "e2e4", ply: 0 })).status).toBe(200);
    expect((await api(bob, id, "move", { uci: "e7e5", ply: 1 })).status).toBe(200);
    expect((await api(alice, id, "action", { action: "flag" })).body.error).toBe("CLOCK_NOT_EXPIRED");
    // Simulate White thinking for 61 seconds (test-only time travel via the service role).
    await admin.from("games").update({ turn_started_at: new Date(Date.now() - 61_000).toISOString() }).eq("id", id);
    const late = await api(alice, id, "move", { uci: "g1f3", ply: 2 });
    expect(late.status).toBe(200);
    expect(late.body.game).toMatchObject({ status: "finished", result: "0-1", termination: "timeout", ply: 2 });
  });

  it("handles draw offers, resignation and rematches", async () => {
    const id = await newGame(alice, bob);
    await api(alice, id, "move", { uci: "e2e4", ply: 0 });
    await api(bob, id, "move", { uci: "e7e5", ply: 1 });
    expect((await api(alice, id, "action", { action: "offer_draw" })).body.game.draw_offer_by).toBe(alice.id);
    expect((await api(alice, id, "action", { action: "accept_draw" })).status).toBe(409);
    expect((await api(bob, id, "action", { action: "decline_draw" })).body.game.draw_offer_by).toBeNull();
    expect((await api(bob, id, "action", { action: "resign" })).body.game).toMatchObject({ result: "1-0", termination: "resignation" });

    expect((await api(bob, id, "action", { action: "offer_rematch" })).body.game.rematch_offer_by).toBe(bob.id);
    const [r1, r2] = await Promise.all([api(alice, id, "action", { action: "accept_rematch" }), api(alice, id, "action", { action: "accept_rematch" })]);
    expect(r1.body.rematch.id).toBe(r2.body.rematch.id);
    expect(r1.body.rematch).toMatchObject({ white_id: bob.id, black_id: alice.id, status: "active", source: "rematch" });
    await finish(bob, r1.body.rematch.id);
  });

  it("rejects non-JSON and cross-site posts", async () => {
    const id = await newGame(alice, bob);
    const form = await fetch(`${APP}/api/games/${id}/action`, { method: "POST", headers: { "content-type": "text/plain", authorization: `Bearer ${alice.token}` }, body: '{"action":"resign"}' });
    expect(form.status).toBe(415);
    const xsite = await fetch(`${APP}/api/games/${id}/action`, { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example", authorization: `Bearer ${alice.token}` }, body: '{"action":"resign"}' });
    expect(xsite.status).toBe(403);
    await finish(alice, id);
  });

  it("allows claiming victory only after the opponent really disappeared", async () => {
    const id = await newGame(alice, bob);
    await api(alice, id, "move", { uci: "e2e4", ply: 0 });
    await api(bob, id, "move", { uci: "e7e5", ply: 1 });
    await api(alice, id, "move", { uci: "g1f3", ply: 2 }); // Bob to move
    await bob.sb.rpc("game_heartbeat", { p_game: id });
    expect((await api(alice, id, "action", { action: "claim_abandonment" })).body.error).toBe("OPPONENT_PRESENT");
    await admin.from("game_presence").update({ last_seen_at: new Date(Date.now() - 120_000).toISOString() }).eq("game_id", id).eq("user_id", bob.id);
    const r = await api(alice, id, "action", { action: "claim_abandonment" });
    expect(r.body.game).toMatchObject({ status: "finished", result: "1-0", termination: "abandonment" });
  });
});
