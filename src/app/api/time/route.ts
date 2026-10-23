export const dynamic = "force-dynamic";

/** Server clock, used by clients to estimate their offset for accurate chess clocks. */
export function GET() {
  return Response.json({ now: Date.now() }, { headers: { "cache-control": "no-store" } });
}
