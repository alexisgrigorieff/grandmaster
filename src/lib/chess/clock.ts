import type { Color, GameRow } from "./types";

type ClockFields = Pick<GameRow, "status" | "ply" | "initial_ms" | "white_ms" | "black_ms" | "turn_started_at" | "fen">;

/** Clocks only start running once both players have made their first move. */
export function clockRunning(g: ClockFields): boolean {
  return g.status === "active" && g.initial_ms != null && g.ply >= 2 && g.turn_started_at != null;
}

export function sideToMove(g: Pick<GameRow, "fen">): Color {
  return g.fen.split(" ")[1] === "b" ? "black" : "white";
}

/**
 * Remaining time for both sides at instant `now` (ms since epoch, in server
 * time). The side to move has the time since `turn_started_at` deducted.
 */
export function remainingClocks(g: ClockFields, now: number): { white: number | null; black: number | null } {
  if (g.initial_ms == null) return { white: null, black: null };
  let white = g.white_ms ?? 0;
  let black = g.black_ms ?? 0;
  if (clockRunning(g)) {
    const elapsed = Math.max(0, now - Date.parse(g.turn_started_at!));
    if (sideToMove(g) === "white") white -= elapsed;
    else black -= elapsed;
  }
  return { white: Math.max(0, white), black: Math.max(0, black) };
}

export function formatClock(ms: number | null): string {
  if (ms == null) return "∞";
  const clamped = Math.max(0, ms);
  const totalSec = clamped / 1000;
  if (totalSec < 10) {
    const s = Math.floor(totalSec);
    const tenths = Math.floor((clamped % 1000) / 100);
    return `0:0${s}.${tenths}`;
  }
  const sec = Math.ceil(totalSec - 1e-9);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
