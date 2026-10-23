import { afterAll, describe, expect, it } from "vitest";
import { DB_URL, as, createUser, expectDbError, pool, rpc, rpcRow, type TestUser } from "./helpers";

type Row = Record<string, any>;

const d = DB_URL ? describe : describe.skip;

async function startGame(a: TestUser, b: TestUser, opts: { initial?: number | null; inc?: number } = {}) {
  const ch = await rpcRow<Row>(a, "create_challenge", [b.id, "white", opts.initial ?? null, opts.inc ?? 0, true]);
  const accepted = await rpcRow<Row>(b, "respond_challenge", [ch.id, true]);
  return accepted.game_id as string;
}

async function serviceUpdateGame(id: string, set: Record<string, unknown>, expectedVersion?: number) {
  const keys = Object.keys(set);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const versionClause = expectedVersion != null ? ` and version = ${expectedVersion}` : "";
  return as("service_role", (c) =>
    c.query(`update public.games set ${sets}, version = version + 1 where id = $1${versionClause} returning *`, [id, ...keys.map((k) => set[k])]),
  );
}

d("database", () => {
  afterAll(async () => {
    await pool?.end();
  });

  describe("accounts and profiles", () => {
    it("creates a profile on sign-up and enforces unique usernames (case-insensitive)", async () => {
      const u = await createUser("alice");
      const p = await as(u, (c) => c.query("select username, rating from public.profiles where id = $1", [u.id]));
      expect(p.rows[0].username).toBe(u.username);
      expect(p.rows[0].rating).toBe(1200);

      expect(await rpc("anon", "username_available", [u.username.toUpperCase()])).toBe(false);
      expect(await rpc("anon", "username_available", ["fresh_name_123"])).toBe(true);
      expect(await rpc("anon", "username_available", ["no spaces"])).toBe(false);

      await expectDbError(
        pool.query(
          `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'x@y.z', $1)`,
          [JSON.stringify({ username: u.username.toUpperCase() })],
        ),
        /USERNAME_TAKEN/,
      );
    });

    it("never exposes email addresses", async () => {
      await expectDbError(as("anon", (c) => c.query("select email from auth.users")), /permission denied/);
      const u = await createUser("priv");
      await expectDbError(as(u, (c) => c.query("select email from auth.users")), /permission denied/);
      const cols = await as(u, (c) => c.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles'"));
      expect(cols.rows.map((r) => r.column_name)).not.toContain("email");
      // Saved settings are private too.
      await expectDbError(as(u, (c) => c.query("select preferences from public.profiles limit 1")), /permission denied/);
      await as(u, (c) => c.query("update public.profiles set preferences = '{\"boardMode\":\"2d\"}' where id = $1", [u.id]));
      expect(await rpc(u, "my_preferences")).toEqual({ boardMode: "2d" });
      expect(await rpc("anon", "my_preferences").catch(() => "denied")).toBe("denied");
    });

    it("lets users edit only their own cosmetic profile fields", async () => {
      const a = await createUser("ed");
      const b = await createUser("ed");
      const r = await as(a, (c) => c.query("update public.profiles set display_name = 'Queen A' where id = $1 returning display_name", [a.id]));
      expect(r.rows[0].display_name).toBe("Queen A");

      await expectDbError(as(a, (c) => c.query("update public.profiles set rating = 3000 where id = $1", [a.id])), /permission denied/);
      await expectDbError(as(a, (c) => c.query("update public.profiles set username = 'hacker' where id = $1", [a.id])), /permission denied/);

      // Avatars must live in the user's own folder of our storage bucket.
      await expectDbError(
        as(a, (c) => c.query("update public.profiles set avatar_url = 'https://tracker.example/pixel.gif' where id = $1", [a.id])),
        /profiles_avatar_url_own_folder/,
      );
      await expectDbError(
        as(a, (c) => c.query(`update public.profiles set avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/${b.id}/a.webp' where id = $1`, [a.id])),
        /profiles_avatar_url_own_folder/,
      );
      await as(a, (c) => c.query(`update public.profiles set avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/${a.id}/a.webp' where id = $1`, [a.id]));

      const other = await as(a, (c) => c.query("update public.profiles set display_name = 'pwned' where id = $1", [b.id]));
      expect(other.rowCount).toBe(0);
      await expectDbError(as(a, (c) => c.query("delete from public.profiles where id = $1", [b.id])), /permission denied/);
    });
  });

  describe("challenges", () => {
    it("runs the full challenge → accept → game flow", async () => {
      const a = await createUser("ca");
      const b = await createUser("cb");
      const ch = await rpcRow<Row>(a, "create_challenge", [b.id, "black", 300000, 3000, true]);
      expect(ch.status).toBe("pending");

      // B sees it, a stranger does not.
      const stranger = await createUser("cs");
      expect((await as(b, (c) => c.query("select id from public.challenges where id = $1", [ch.id]))).rowCount).toBe(1);
      expect((await as(stranger, (c) => c.query("select id from public.challenges where id = $1", [ch.id]))).rowCount).toBe(0);

      // Only the recipient may answer.
      await expectDbError(rpcRow(a, "respond_challenge", [ch.id, true]), /CHALLENGE_NOT_FOUND/);
      await expectDbError(rpcRow(stranger, "respond_challenge", [ch.id, true]), /CHALLENGE_NOT_FOUND/);

      const acc = await rpcRow<Row>(b, "respond_challenge", [ch.id, true]);
      expect(acc.status).toBe("accepted");
      const g = (await as(a, (c) => c.query("select * from public.games where id = $1", [acc.game_id]))).rows[0];
      expect(g.white_id).toBe(b.id); // challenger asked for black
      expect(g.black_id).toBe(a.id);
      expect(g.initial_ms).toBe(300000);
      expect(g.white_ms).toBe(300000);

      // Answering twice is rejected.
      await expectDbError(rpcRow(b, "respond_challenge", [ch.id, true]), /CHALLENGE_NOT_PENDING/);
    });

    it("rejects self-challenges, duplicates, crossed challenges and busy players", async () => {
      const a = await createUser("da");
      const b = await createUser("db");
      const c = await createUser("dc");
      await expectDbError(rpcRow(a, "create_challenge", [a.id, "random", null, 0, true]), /CANNOT_CHALLENGE_SELF/);
      await expectDbError(rpcRow(a, "create_challenge", [b.id, "random", 1000, 0, true]), /INVALID_TIME_CONTROL/);
      await rpcRow(a, "create_challenge", [b.id, "random", null, 0, true]);
      await expectDbError(rpcRow(a, "create_challenge", [b.id, "random", null, 0, true]), /CHALLENGE_ALREADY_PENDING/);
      await expectDbError(rpcRow(b, "create_challenge", [a.id, "random", null, 0, true]), /OPPONENT_ALREADY_CHALLENGED_YOU/);

      // A also challenged C; when C's game with B starts... (B accepts A)
      const toC = await rpcRow<Row>(a, "create_challenge", [c.id, "random", null, 0, true]);
      const pendingForB = (await as(b, (cl) => cl.query("select * from public.challenges where to_id = $1 and status = 'pending'", [b.id]))).rows[0];
      await rpcRow(b, "respond_challenge", [pendingForB.id, true]);

      // ...A's other pending challenge is withdrawn automatically,
      const after = (await as(a, (cl) => cl.query("select status from public.challenges where id = $1", [toC.id]))).rows[0];
      expect(after.status).toBe("cancelled");
      // and nobody can challenge A or B while they play.
      await expectDbError(rpcRow(c, "create_challenge", [a.id, "random", null, 0, true]), /OPPONENT_IN_A_GAME/);
      await expectDbError(rpcRow(a, "create_challenge", [c.id, "random", null, 0, true]), /YOU_ARE_IN_A_GAME/);
    });

    it("can be declined and cancelled", async () => {
      const a = await createUser("ea");
      const b = await createUser("eb");
      const ch = await rpcRow<Row>(a, "create_challenge", [b.id, "random", null, 0, true]);
      expect((await rpcRow<Row>(b, "respond_challenge", [ch.id, false])).status).toBe("declined");
      const ch2 = await rpcRow<Row>(a, "create_challenge", [b.id, "random", null, 0, true]);
      await expectDbError(rpcRow(b, "cancel_challenge", [ch2.id]), /CHALLENGE_NOT_PENDING/);
      expect((await rpcRow<Row>(a, "cancel_challenge", [ch2.id])).status).toBe("cancelled");
    });

    it("never puts a player into two games when challenges are accepted concurrently", async () => {
      const target = await createUser("ta");
      const challengers = await Promise.all([1, 2, 3, 4].map(() => createUser("tc")));
      const chs = await Promise.all(challengers.map((c) => rpcRow<Row>(c, "create_challenge", [target.id, "random", null, 0, true])));
      const results = await Promise.allSettled(chs.map((ch) => rpcRow<Row>(target, "respond_challenge", [ch.id, true])));
      const accepted = results.filter((r) => r.status === "fulfilled" && (r.value as Row).status === "accepted");
      expect(accepted).toHaveLength(1);
      const games = await pool.query("select count(*)::int as n from public.games where $1 in (white_id, black_id)", [target.id]);
      expect(games.rows[0].n).toBe(1);
    });
  });

  describe("games: access control", () => {
    it("lets only the two players read a game and nobody write it directly", async () => {
      const a = await createUser("ga");
      const b = await createUser("gb");
      const x = await createUser("gx");
      const gameId = await startGame(a, b);

      expect((await as(a, (c) => c.query("select id from public.games where id = $1", [gameId]))).rowCount).toBe(1);
      expect((await as(b, (c) => c.query("select id from public.games where id = $1", [gameId]))).rowCount).toBe(1);
      expect((await as(x, (c) => c.query("select id from public.games where id = $1", [gameId]))).rowCount).toBe(0);
      expect((await as("anon", (c) => c.query("select id from public.games where id = $1", [gameId]).catch(() => ({ rowCount: 0 })))).rowCount).toBe(0);

      await expectDbError(as(a, (c) => c.query("update public.games set fen = 'x' where id = $1", [gameId])), /permission denied/);
      await expectDbError(as(a, (c) => c.query("update public.games set status = 'finished', result = '1-0' where id = $1", [gameId])), /permission denied/);
      await expectDbError(
        as(a, (c) => c.query("insert into public.games (white_id, black_id) values ($1, $2)", [a.id, x.id])),
        /permission denied/,
      );
      await expectDbError(as(a, (c) => c.query("delete from public.games where id = $1", [gameId])), /permission denied/);
      await expectDbError(as(a, (c) => c.query("delete from public.active_players where game_id = $1", [gameId])), /permission denied/);
      await expectDbError(rpcRow(a, "_start_game", [a.id, x.id, null, 0, true, "challenge"]), /permission denied/);
      await expectDbError(rpcRow(a, "accept_rematch", [gameId, a.id]), /permission denied/);
    });

    it("applies compare-and-swap so concurrent writers cannot both win", async () => {
      const a = await createUser("cas");
      const b = await createUser("cas");
      const gameId = await startGame(a, b);
      const attempts = await Promise.all(
        [0, 1, 2, 3, 4].map((i) => serviceUpdateGame(gameId, { pgn: `attempt ${i}`, ply: 1 }, 0)),
      );
      expect(attempts.filter((r) => r.rowCount === 1)).toHaveLength(1);
      const g = (await pool.query("select version from public.games where id = $1", [gameId])).rows[0];
      expect(g.version).toBe(1);
    });

    it("releases players, applies Elo, and refuses to resurrect a finished game", async () => {
      const a = await createUser("elo");
      const b = await createUser("elo");
      const gameId = await startGame(a, b, { initial: 300000 }); // a is white
      expect((await pool.query("select count(*)::int n from public.active_players where game_id = $1", [gameId])).rows[0].n).toBe(2);
      // Each player sees only their own active-game row.
      expect((await as(a, (c) => c.query("select user_id from public.active_players where game_id = $1", [gameId]))).rows).toEqual([{ user_id: a.id }]);

      await serviceUpdateGame(gameId, { status: "finished", result: "1-0", termination: "resignation", ply: 10 });
      const g = (await pool.query("select * from public.games where id = $1", [gameId])).rows[0];
      expect(g.white_rating).toBe(1200);
      expect(g.white_rating_diff).toBe(20);
      expect(g.black_rating_diff).toBe(-20);
      expect(g.finished_at).not.toBeNull();

      const pa = (await pool.query("select rating, rated_games from public.profiles where id = $1", [a.id])).rows[0];
      const pb = (await pool.query("select rating from public.profiles where id = $1", [b.id])).rows[0];
      expect(pa).toEqual({ rating: 1220, rated_games: 1 });
      expect(pb.rating).toBe(1180);
      expect((await pool.query("select count(*)::int n from public.active_players where game_id = $1", [gameId])).rows[0].n).toBe(0);

      await expectDbError(serviceUpdateGame(gameId, { status: "active" }), /GAME_ALREADY_OVER/);
      // Players are immutable even for the service role.
      await serviceUpdateGame(gameId, { white_id: b.id });
      expect((await pool.query("select white_id from public.games where id = $1", [gameId])).rows[0].white_id).toBe(a.id);

      const stats = await rpc<Row>("anon", "profile_stats", [a.id]);
      expect(stats).toEqual({ games: 1, wins: 1, losses: 0, draws: 0 });
      const hist = await as("anon", (c) => c.query("select * from public.profile_games($1, 10, null)", [b.id]));
      expect(hist.rows[0]).toMatchObject({ outcome: "loss", color: "black", opponent_username: a.username, rating_diff: -20 });
    });

    it("never rates untimed games or games that ended in the first moves", async () => {
      const a = await createUser("ur");
      const b = await createUser("ur");
      const untimed = await startGame(a, b);
      expect((await pool.query("select rated from public.games where id = $1", [untimed])).rows[0].rated).toBe(false);
      await serviceUpdateGame(untimed, { status: "finished", result: "1-0", termination: "resignation", ply: 20 });
      const short = await startGame(a, b, { initial: 60000 });
      await serviceUpdateGame(short, { status: "finished", result: "1-0", termination: "resignation", ply: 2 });
      const g = (await pool.query("select rated, white_rating_diff from public.games where id = $1", [short])).rows[0];
      expect(g).toEqual({ rated: false, white_rating_diff: null });
      const pa = (await pool.query("select rating, rated_games from public.profiles where id = $1", [a.id])).rows[0];
      expect(pa).toEqual({ rating: 1200, rated_games: 0 });
    });

    it("does not rate aborted games", async () => {
      const a = await createUser("ab");
      const b = await createUser("ab");
      const gameId = await startGame(a, b);
      await serviceUpdateGame(gameId, { status: "aborted", termination: "aborted" });
      const pa = (await pool.query("select rating, rated_games from public.profiles where id = $1", [a.id])).rows[0];
      expect(pa).toEqual({ rating: 1200, rated_games: 0 });
      expect(await rpc<Row>("anon", "profile_stats", [a.id])).toEqual({ games: 0, wins: 0, losses: 0, draws: 0 });
    });
  });

  describe("rematch", () => {
    it("creates exactly one rematch with colours swapped", async () => {
      const a = await createUser("rm");
      const b = await createUser("rm");
      const gameId = await startGame(a, b);
      await serviceUpdateGame(gameId, { status: "finished", result: "1/2-1/2", termination: "agreement" });
      await expectDbError(rpcRow("service_role", "accept_rematch", [gameId, b.id]), /NO_REMATCH_OFFER/);
      await serviceUpdateGame(gameId, { rematch_offer_by: a.id });
      await expectDbError(rpcRow("service_role", "accept_rematch", [gameId, a.id]), /NO_REMATCH_OFFER/);

      const [r1, r2] = await Promise.all([
        rpcRow<Row>("service_role", "accept_rematch", [gameId, b.id]),
        rpcRow<Row>("service_role", "accept_rematch", [gameId, b.id]),
      ]);
      expect(r1.id).toBe(r2.id);
      expect(r1.white_id).toBe(b.id);
      expect(r1.black_id).toBe(a.id);
      const old = (await pool.query("select rematch_game_id from public.games where id = $1", [gameId])).rows[0];
      expect(old.rematch_game_id).toBe(r1.id);
    });

    it("lets rematch offers expire", async () => {
      const a = await createUser("rx");
      const b = await createUser("rx");
      const gameId = await startGame(a, b);
      await serviceUpdateGame(gameId, { status: "finished", result: "1-0", termination: "resignation", rematch_offer_by: a.id });
      await pool.query("update public.games set finished_at = now() - interval '1 hour' where id = $1", [gameId]);
      await expectDbError(rpcRow("service_role", "accept_rematch", [gameId, b.id]), /REMATCH_EXPIRED/);
    });
  });

  describe("quick play", () => {
    it("pairs two waiting players with the same time control", async () => {
      const a = await createUser("qa");
      const b = await createUser("qb");
      const c = await createUser("qc");
      expect(await rpc<Row>(a, "quick_play_join", [180000, 2000])).toMatchObject({ status: "waiting" });
      expect(await rpc<Row>(c, "quick_play_join", [600000, 0])).toMatchObject({ status: "waiting" });
      const rb = await rpc<Row>(b, "quick_play_join", [180000, 2000]);
      expect(rb.status).toBe("matched");
      expect(await rpc<Row>(a, "quick_play_poll")).toEqual({ status: "matched", game_id: rb.game_id });
      expect(await rpc<Row>(c, "quick_play_poll")).toMatchObject({ status: "waiting" });
      const g = (await pool.query("select * from public.games where id = $1", [rb.game_id])).rows[0];
      expect([g.white_id, g.black_id].sort()).toEqual([a.id, b.id].sort());
      expect(g.source).toBe("quickplay");
      await expectDbError(rpc(a, "quick_play_join", [180000, 2000]), /YOU_ARE_IN_A_GAME/);
      await rpc(c, "quick_play_leave");
      expect(await rpc<Row>(c, "quick_play_poll")).toMatchObject({ status: "idle" });
    });

    it("never double-books players when many join at once", async () => {
      // Make sure no stale waiting players from other tests interfere.
      await pool.query("delete from public.matchmaking_queue");
      const users = await Promise.all(Array.from({ length: 8 }, () => createUser("qq")));
      await Promise.all(users.map((u) => rpc(u, "quick_play_join", [60000, 0])));
      // Anyone left waiting retries (as the client does every few seconds).
      await Promise.all(users.map((u) => rpc(u, "quick_play_poll")));
      const ids = users.map((u) => u.id);
      const games = await pool.query(
        "select id, white_id, black_id from public.games where white_id = any($1) or black_id = any($1)",
        [ids],
      );
      expect(games.rowCount).toBe(4);
      const seen = games.rows.flatMap((g) => [g.white_id, g.black_id]);
      expect(new Set(seen).size).toBe(8);
    });

    it("ignores queue entries whose owner stopped polling", async () => {
      await pool.query("delete from public.matchmaking_queue");
      const a = await createUser("st");
      const b = await createUser("st");
      await rpc(a, "quick_play_join", [120000, 1000]);
      await pool.query("update public.matchmaking_queue set heartbeat_at = now() - interval '1 minute' where user_id = $1", [a.id]);
      expect(await rpc<Row>(b, "quick_play_join", [120000, 1000])).toMatchObject({ status: "waiting" });
    });
  });

  describe("chat", () => {
    it("lets players chat, blocks outsiders and impersonation, rate-limits floods", async () => {
      const a = await createUser("ch");
      const b = await createUser("ch");
      const x = await createUser("chx");
      const gameId = await startGame(a, b);
      await as(a, (c) => c.query("insert into public.game_messages (game_id, body) values ($1, 'good luck!')", [gameId]));
      const seen = await as(b, (c) => c.query("select user_id, body from public.game_messages where game_id = $1", [gameId]));
      expect(seen.rows).toEqual([{ user_id: a.id, body: "good luck!" }]);
      expect((await as(x, (c) => c.query("select * from public.game_messages where game_id = $1", [gameId]))).rowCount).toBe(0);

      await expectDbError(as(x, (c) => c.query("insert into public.game_messages (game_id, body) values ($1, 'hi')", [gameId])), /row-level security/);
      await expectDbError(
        as(a, (c) => c.query("insert into public.game_messages (game_id, user_id, body) values ($1, $2, 'spoof')", [gameId, b.id])),
        /permission denied/,
      );
      await expectDbError(
        as(a, async (c) => {
          for (let i = 0; i < 10; i++) await c.query("insert into public.game_messages (game_id, body) values ($1, $2)", [gameId, `m${i}`]);
        }),
        /CHAT_RATE_LIMIT/,
      );
      // Chat closes an hour after the game ends.
      await serviceUpdateGame(gameId, { status: "finished", result: "1/2-1/2", termination: "agreement" });
      await pool.query("update public.games set finished_at = now() - interval '2 hours' where id = $1", [gameId]);
      await expectDbError(as(b, (c) => c.query("insert into public.game_messages (game_id, body) values ($1, 'gg')", [gameId])), /CHAT_CLOSED/);
    });
  });

  describe("heartbeat", () => {
    it("records presence only for participants", async () => {
      const a = await createUser("hb");
      const b = await createUser("hb");
      const x = await createUser("hbx");
      const gameId = await startGame(a, b);
      await rpc(a, "game_heartbeat", [gameId]);
      await expectDbError(rpc(x, "game_heartbeat", [gameId]), /GAME_NOT_FOUND/);
      const r = await pool.query("select user_id from public.game_presence where game_id = $1", [gameId]);
      expect(r.rows).toEqual([{ user_id: a.id }]);
    });
  });
});
