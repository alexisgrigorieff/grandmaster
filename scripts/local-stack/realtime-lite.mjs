// Local test double for Supabase Realtime.
//
// Implements the subset of the Phoenix/Supabase Realtime wire protocol used by
// @supabase/realtime-js (vsn 2.0.0 JSON frames): channel join/leave,
// heartbeats, access-token updates, Presence (track/untrack/state/diff) and
// postgres_changes with per-subscriber RLS checks.
//
// Row changes arrive via LISTEN/NOTIFY triggers (sql/20-realtime-notify.sql)
// instead of logical replication. This is ONLY for automated tests of the app
// without the hosted service — production uses Supabase Realtime itself.
import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.REALTIME_PORT ?? 4000);
const JWT_SECRET = process.env.JWT_SECRET;
const DB_URL = process.env.DATABASE_URL;
const PK = { games: "id", challenges: "id", game_messages: "id", matchmaking_queue: "user_id" };

const log = (...a) => process.env.REALTIME_DEBUG && console.log("[realtime]", ...a);

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function verifyJwt(token) {
  try {
    const [h, p, s] = token.split(".");
    const expected = b64url(crypto.createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest());
    if (expected !== s) return null;
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 10 });
let refSeq = 1;
const nextRef = () => String(refSeq++);

/** topic -> Map<key, Map<phxRef, {meta, conn}>> */
const presence = new Map();
/** all live connections */
const conns = new Set();

function send(conn, joinRef, ref, topic, event, payload) {
  if (conn.ws.readyState !== 1) return;
  conn.ws.send(JSON.stringify([joinRef ?? null, ref ?? null, topic, event, payload]));
}

function topicState(topic) {
  const out = {};
  for (const [key, entries] of presence.get(topic) ?? []) {
    if (entries.size) out[key] = { metas: [...entries.entries()].map(([phx_ref, e]) => ({ ...e.meta, phx_ref })) };
  }
  return out;
}

function broadcastDiff(topic, joins, leaves) {
  for (const c of conns) {
    const ch = c.channels.get(topic);
    if (ch) send(c, ch.joinRef, null, topic, "presence_diff", { joins, leaves });
  }
}

function untrack(conn, topic) {
  const ch = conn.channels.get(topic);
  if (!ch?.tracked) return null;
  const { key, phxRef, meta } = ch.tracked;
  presence.get(topic)?.get(key)?.delete(phxRef);
  ch.tracked = null;
  return { key, phxRef, meta };
}

function handle(conn, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  const [joinRef, ref, topic, event, payload] = Array.isArray(msg) ? msg : [msg.join_ref, msg.ref, msg.topic, msg.event, msg.payload];
  const reply = (status, response = {}) => send(conn, joinRef, ref, topic, "phx_reply", { status, response });

  if (topic === "phoenix" && event === "heartbeat") return reply("ok");

  if (event === "phx_join") {
    const cfg = payload?.config ?? {};
    const claims = (payload?.access_token && verifyJwt(payload.access_token)) || conn.claims;
    const bindings = (cfg.postgres_changes ?? []).map((b) => ({ ...b, id: Math.floor(Math.random() * 1e9) }));
    conn.channels.set(topic, { joinRef, claims, bindings, key: cfg.presence?.key || crypto.randomUUID(), tracked: null });
    reply("ok", bindings.length ? { postgres_changes: bindings } : {});
    send(conn, joinRef, null, topic, "presence_state", topicState(topic));
    if (bindings.length) send(conn, joinRef, null, topic, "system", { status: "ok", message: "Subscribed to PostgreSQL", extension: "postgres_changes", channel: topic.replace(/^realtime:/, "") });
    log("join", topic, claims?.sub ?? claims?.role, bindings.length);
    return;
  }

  const ch = conn.channels.get(topic);
  if (event === "access_token") {
    const claims = verifyJwt(payload?.access_token ?? "");
    if (ch && claims) ch.claims = claims;
    log("access_token", topic, claims?.sub ?? "invalid");
    return reply("ok");
  }
  if (!ch) return reply("error", { reason: "unmatched topic" });

  if (event === "phx_leave") {
    const left = untrack(conn, topic);
    conn.channels.delete(topic);
    if (left) broadcastDiff(topic, {}, { [left.key]: { metas: [{ ...left.meta, phx_ref: left.phxRef }] } });
    return reply("ok");
  }

  if (event === "presence") {
    if (payload?.event === "track") {
      const prev = untrack(conn, topic);
      const phxRef = nextRef();
      const meta = payload.payload ?? {};
      if (!presence.has(topic)) presence.set(topic, new Map());
      const t = presence.get(topic);
      if (!t.has(ch.key)) t.set(ch.key, new Map());
      t.get(ch.key).set(phxRef, { meta, conn });
      ch.tracked = { key: ch.key, phxRef, meta };
      broadcastDiff(
        topic,
        { [ch.key]: { metas: [{ ...meta, phx_ref: phxRef, ...(prev ? { phx_ref_prev: prev.phxRef } : {}) }] } },
        prev ? { [prev.key]: { metas: [{ ...prev.meta, phx_ref: prev.phxRef }] } } : {},
      );
    } else if (payload?.event === "untrack") {
      const left = untrack(conn, topic);
      if (left) broadcastDiff(topic, {}, { [left.key]: { metas: [{ ...left.meta, phx_ref: left.phxRef }] } });
    }
    return reply("ok");
  }

  if (event === "broadcast") {
    for (const c of conns) {
      const other = c.channels.get(topic);
      if (other && c !== conn) send(c, other.joinRef, null, topic, "broadcast", payload);
    }
    return reply("ok");
  }
  reply("ok");
}

function matches(binding, table, type, row) {
  if (binding.schema && binding.schema !== "*" && binding.schema !== "public") return false;
  if (binding.table && binding.table !== "*" && binding.table !== table) return false;
  if (binding.event && binding.event !== "*" && binding.event.toUpperCase() !== type) return false;
  if (binding.filter) {
    const m = /^([a-z_]+)=eq\.(.+)$/.exec(binding.filter);
    if (!m) return false;
    if (String(row?.[m[1]]) !== m[2]) return false;
  }
  return true;
}

async function canSee(claims, table, key) {
  if (!claims || claims.role === "service_role") return true;
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)", [JSON.stringify(claims), claims.sub ?? ""]);
    await client.query(`set local role ${claims.role === "authenticated" ? "authenticated" : "anon"}`);
    const r = await client.query(`select 1 from public.${table} where ${PK[table]} = $1`, [key]);
    await client.query("rollback");
    return r.rowCount > 0;
  } catch {
    await client.query("rollback").catch(() => {});
    return false;
  } finally {
    client.release();
  }
}

async function onChange(note) {
  const { table, type, key, old, ts } = JSON.parse(note.payload);
  let record = null;
  if (type !== "DELETE") {
    const r = await pool.query(`select to_jsonb(t) as row from public.${table} t where ${PK[table]} = $1`, [key]);
    record = r.rows[0]?.row ?? null;
    if (!record) return;
  }
  const row = record ?? old;
  for (const conn of conns) {
    for (const [topic, ch] of conn.channels) {
      const ids = ch.bindings.filter((b) => matches(b, table, type, row)).map((b) => b.id);
      if (!ids.length) continue;
      if (type !== "DELETE" && !(await canSee(ch.claims, table, key))) {
        log("rls-denied", table, "->", topic, ch.claims?.sub ?? ch.claims?.role);
        continue;
      }
      send(conn, ch.joinRef, null, topic, "postgres_changes", {
        ids,
        data: { schema: "public", table, commit_timestamp: ts, type, columns: [], record: record ?? {}, old_record: type === "INSERT" ? {} : { [PK[table]]: row[PK[table]] }, errors: null },
      });
      log("change", table, type, "->", topic);
    }
  }
}

const listener = new pg.Client({ connectionString: DB_URL });
await listener.connect();
await listener.query("listen local_realtime");
listener.on("notification", (n) => void onChange(n).catch((e) => console.error("[realtime] change error", e.message)));

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, connections: conns.size }));
});
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://x");
  const apikey = url.searchParams.get("apikey");
  const claims = apikey ? verifyJwt(apikey) : null;
  if (!claims) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    const conn = { ws, claims, channels: new Map() };
    conns.add(conn);
    ws.on("message", (m) => handle(conn, m));
    ws.on("close", () => {
      conns.delete(conn);
      for (const topic of conn.channels.keys()) {
        const left = untrack(conn, topic);
        if (left) broadcastDiff(topic, {}, { [left.key]: { metas: [{ ...left.meta, phx_ref: left.phxRef }] } });
      }
    });
  });
});
server.listen(PORT, "127.0.0.1", () => console.log(`[realtime-lite] listening on :${PORT}`));
