// Prints anon and service_role JWTs for the local test stack's secret.
import crypto from "node:crypto";
const secret = process.env.JWT_SECRET;
const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (payload) => {
  const h = enc({ alg: "HS256", typ: "JWT" });
  const p = enc(payload);
  return `${h}.${p}.${crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`;
};
const now = Math.floor(Date.now() / 1000);
const exp = now + 10 * 365 * 24 * 3600;
console.log(`ANON_KEY=${sign({ iss: "supabase", role: "anon", iat: now, exp })}`);
console.log(`SERVICE_ROLE_KEY=${sign({ iss: "supabase", role: "service_role", iat: now, exp })}`);
