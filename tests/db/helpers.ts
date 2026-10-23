import pg from "pg";
import { randomUUID } from "node:crypto";

/**
 * Database tests run against a real PostgreSQL that has the Supabase roles and
 * GoTrue's auth schema (see scripts/local-stack). Set TEST_DATABASE_URL to a
 * superuser connection string, e.g.
 *   postgres://postgres:postgres@127.0.0.1:5432/postgres
 */
export const DB_URL = process.env.TEST_DATABASE_URL;

export const pool = DB_URL ? new pg.Pool({ connectionString: DB_URL, max: 20 }) : (null as unknown as pg.Pool);

export interface TestUser {
  id: string;
  username: string;
}

export async function createUser(prefix = "u"): Promise<TestUser> {
  const id = randomUUID();
  const username = `${prefix}_${id.slice(0, 8)}`;
  await pool.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, '', now(), $3, now(), now())`,
    [id, `${username}@example.test`, JSON.stringify({ username })],
  );
  return { id, username };
}

type Role = "anon" | "authenticated" | "service_role";

/** Run `fn` in a transaction with the same role/claims PostgREST would set. */
export async function as<T>(
  who: TestUser | Role,
  fn: (c: pg.PoolClient) => Promise<T>,
  client?: pg.PoolClient,
): Promise<T> {
  const c = client ?? (await pool.connect());
  const role: Role = typeof who === "string" ? who : "authenticated";
  const claims = typeof who === "string" ? { role } : { sub: who.id, role: "authenticated", aud: "authenticated" };
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [typeof who === "string" ? "" : who.id]);
    await c.query(`set local role ${role}`);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    if (!client) c.release();
  }
}

export async function rpc<T = unknown>(who: TestUser | Role, fn: string, args: unknown[] = []): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  return as(who, async (c) => {
    const r = await c.query(`select public.${fn}(${placeholders}) as v`, args);
    return r.rows[0].v as T;
  });
}

export async function expectDbError(p: Promise<unknown>, pattern: RegExp) {
  let error: unknown;
  try {
    await p;
  } catch (e) {
    error = e;
  }
  if (!error) throw new Error(`expected error matching ${pattern}, but the call succeeded`);
  const msg = (error as Error).message;
  if (!pattern.test(msg)) throw new Error(`expected error matching ${pattern}, got: ${msg}`);
}

/** Call a function that returns a row type (e.g. public.challenges). */
export async function rpcRow<T = Record<string, unknown>>(who: TestUser | Role, fn: string, args: unknown[] = []): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  return as(who, async (c) => {
    const r = await c.query(`select * from public.${fn}(${placeholders})`, args);
    return r.rows[0] as T;
  });
}
