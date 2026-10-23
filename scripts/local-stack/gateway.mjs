// Tiny API gateway that mimics the hosted Supabase URL layout on one port:
//   /auth/v1/*     -> GoTrue
//   /rest/v1/*     -> PostgREST
//   /realtime/v1/* -> realtime-lite (HTTP + WebSocket)
//   /storage/v1/*  -> storage-lite
// Test stack only.
import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.GATEWAY_PORT ?? 54321);
const ROUTES = [
  { prefix: "/auth/v1", port: Number(process.env.AUTH_PORT ?? 9999), strip: true },
  { prefix: "/rest/v1", port: Number(process.env.REST_PORT ?? 3001), strip: true },
  { prefix: "/realtime/v1", port: Number(process.env.REALTIME_PORT ?? 4000), strip: false },
  { prefix: "/storage/v1", port: Number(process.env.STORAGE_PORT ?? 5001), strip: true },
];

function route(url) {
  const r = ROUTES.find((x) => url === x.prefix || url.startsWith(x.prefix + "/") || url.startsWith(x.prefix + "?"));
  if (!r) return null;
  return { port: r.port, path: r.strip ? url.slice(r.prefix.length) || "/" : url };
}

function cors(req, res) {
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD");
  res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("access-control-expose-headers", "content-range, x-supabase-api-version, content-profile");
}

const server = http.createServer((req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  const r = route(req.url ?? "/");
  if (!r) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ message: "no route" }));
  }
  const headers = { ...req.headers, host: `127.0.0.1:${r.port}` };
  // PostgREST only looks at Authorization; mimic Kong by defaulting it to the apikey.
  if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
  const up = http.request({ host: "127.0.0.1", port: r.port, method: req.method, path: r.path, headers }, (ur) => {
    const h = { ...ur.headers };
    delete h["access-control-allow-origin"];
    res.writeHead(ur.statusCode ?? 502, h);
    ur.pipe(res);
  });
  up.on("error", (e) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: `upstream error: ${e.message}` }));
  });
  req.pipe(up);
});

server.on("upgrade", (req, socket, head) => {
  const r = route(req.url ?? "/");
  if (!r) return socket.destroy();
  const up = net.connect(r.port, "127.0.0.1", () => {
    let raw = `${req.method} ${r.path} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    up.write(raw + "\r\n");
    if (head?.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

server.listen(PORT, "0.0.0.0", () => console.log(`[gateway] listening on :${PORT}`));
