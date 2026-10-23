"use client";

/**
 * Estimated offset between this device's clock and the server's, so clocks
 * and challenge expiry are correct even when the device clock is wrong.
 */
let offset = 0;
let bestRtt = Infinity;
let started = false;

async function sample() {
  try {
    const t0 = Date.now();
    const res = await fetch("/api/time", { cache: "no-store" });
    const t1 = Date.now();
    const { now } = (await res.json()) as { now: number };
    const rtt = t1 - t0;
    if (rtt <= bestRtt) {
      bestRtt = rtt;
      offset = now - (t0 + rtt / 2);
    }
  } catch {
    /* offline: keep the previous estimate */
  }
}

export function syncServerTime() {
  if (started || typeof window === "undefined") return;
  started = true;
  void (async () => {
    for (let i = 0; i < 3; i++) await sample();
  })();
  setInterval(() => {
    bestRtt = Infinity;
    void sample();
  }, 5 * 60_000);
}

/** Learn from a server timestamp included in an API response. */
export function observeServerTime(serverNow: number, requestStartedAt: number) {
  const rtt = Date.now() - requestStartedAt;
  if (rtt < bestRtt) {
    bestRtt = rtt;
    offset = serverNow - (requestStartedAt + rtt / 2);
  }
}

export function serverNow(): number {
  return Date.now() + offset;
}
