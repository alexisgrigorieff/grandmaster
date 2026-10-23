// Minimal SMTP sink + HTTP inbox for the local test stack, so password-reset
// emails sent by GoTrue can be read by tests.  GET /messages -> JSON array.
import net from "node:net";
import http from "node:http";

const SMTP_PORT = Number(process.env.SMTP_PORT ?? 2500);
const HTTP_PORT = Number(process.env.MAIL_HTTP_PORT ?? 8025);
const messages = [];

net
  .createServer((sock) => {
    let mode = "cmd";
    let buf = "";
    let cur = { from: "", to: [], data: "" };
    const say = (s) => sock.write(s + "\r\n");
    say("220 mailcatcher ESMTP");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      while (true) {
        if (mode === "data") {
          const end = buf.indexOf("\r\n.\r\n");
          if (end === -1) return;
          cur.data += buf.slice(0, end);
          buf = buf.slice(end + 5);
          messages.push({ ...cur, receivedAt: new Date().toISOString() });
          cur = { from: "", to: [], data: "" };
          mode = "cmd";
          say("250 OK queued");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl === -1) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") {
          sock.write("250-mailcatcher\r\n250-8BITMIME\r\n250 SIZE 10485760\r\n");
        } else if (cmd === "HELO") say("250 mailcatcher");
        else if (cmd === "MAIL") {
          cur.from = line.slice(10).trim();
          say("250 OK");
        } else if (cmd === "RCPT") {
          cur.to.push(line.slice(8).trim().replace(/[<>]/g, ""));
          say("250 OK");
        } else if (cmd === "DATA") {
          mode = "data";
          say("354 End data with <CR><LF>.<CR><LF>");
        } else if (cmd === "QUIT") {
          say("221 Bye");
          sock.end();
        } else if (cmd === "RSET") {
          cur = { from: "", to: [], data: "" };
          say("250 OK");
        } else say("250 OK");
      }
    });
    sock.on("error", () => {});
  })
  .listen(SMTP_PORT, "127.0.0.1", () => console.log(`[mail] smtp on :${SMTP_PORT}`));

http
  .createServer((req, res) => {
    if (req.method === "DELETE") messages.length = 0;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(messages));
  })
  .listen(HTTP_PORT, "127.0.0.1", () => console.log(`[mail] inbox on :${HTTP_PORT}`));
