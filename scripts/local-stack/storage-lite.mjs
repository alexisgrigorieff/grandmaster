// Local test double for the slice of Supabase Storage the app uses (public
// avatar uploads). Uploads are authorised by inserting into storage.objects as
// the calling user, so the RLS policies from the migrations are exercised.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const PORT = Number(process.env.STORAGE_PORT ?? 5001);
const DIR = process.env.STORAGE_DIR ?? "/tmp/grandmaster-storage";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
fs.mkdirSync(DIR, { recursive: true });

function verify(token) {
  try {
    const [h, p, s] = token.split(".");
    const sig = crypto.createHmac("sha256", process.env.JWT_SECRET).update(`${h}.${p}`).digest("base64url");
    return sig === s ? JSON.parse(Buffer.from(p, "base64url").toString()) : null;
  } catch {
    return null;
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const json = (code, body) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    let m = /^\/object\/public\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (req.method === "GET" && m) {
      const file = path.join(DIR, m[1], decodeURIComponent(m[2]));
      if (!file.startsWith(DIR) || !fs.existsSync(file)) return json(404, { message: "Not found" });
      res.writeHead(200, { "content-type": "image/webp", "cache-control": "public, max-age=3600" });
      return fs.createReadStream(file).pipe(res);
    }
    m = /^\/object\/([^/]+)\/(.+)$/.exec(url.pathname);
    if ((req.method === "POST" || req.method === "PUT") && m) {
      const claims = verify((req.headers.authorization ?? "").replace(/^Bearer /i, ""));
      if (!claims) return json(401, { message: "Invalid JWT" });
      const [bucket, name] = [m[1], decodeURIComponent(m[2])];
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        await client.query(`set local role ${claims.role === "service_role" ? "service_role" : claims.role === "authenticated" ? "authenticated" : "anon"}`);
        const b = await client.query("select file_size_limit from storage.buckets where id = $1", [bucket]);
        if (!b.rowCount) throw Object.assign(new Error("Bucket not found"), { code: 404 });
        if (b.rows[0].file_size_limit && body.length > Number(b.rows[0].file_size_limit)) throw Object.assign(new Error("Payload too large"), { code: 413 });
        await client.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)", [bucket, name, claims.sub ?? null]);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback").catch(() => {});
        client.release();
        return json(e.code === 404 ? 404 : e.code === 413 ? 413 : 403, { statusCode: "403", error: "Unauthorized", message: e.message });
      }
      client.release();
      const file = path.join(DIR, bucket, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      return json(200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID() });
    }
    json(404, { message: "Not supported by storage-lite" });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`[storage-lite] listening on :${PORT}`));
