export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export interface TimeControl {
  id: string;
  label: string;
  /** null = no clock */
  initialMs: number | null;
  incrementMs: number;
  category: "Bullet" | "Blitz" | "Rapid" | "Classical" | "Casual";
}

export const TIME_CONTROLS: TimeControl[] = [
  { id: "1+0", label: "1 + 0", initialMs: 60_000, incrementMs: 0, category: "Bullet" },
  { id: "2+1", label: "2 + 1", initialMs: 120_000, incrementMs: 1_000, category: "Bullet" },
  { id: "3+0", label: "3 + 0", initialMs: 180_000, incrementMs: 0, category: "Blitz" },
  { id: "3+2", label: "3 + 2", initialMs: 180_000, incrementMs: 2_000, category: "Blitz" },
  { id: "5+0", label: "5 + 0", initialMs: 300_000, incrementMs: 0, category: "Blitz" },
  { id: "5+3", label: "5 + 3", initialMs: 300_000, incrementMs: 3_000, category: "Blitz" },
  { id: "10+0", label: "10 + 0", initialMs: 600_000, incrementMs: 0, category: "Rapid" },
  { id: "10+5", label: "10 + 5", initialMs: 600_000, incrementMs: 5_000, category: "Rapid" },
  { id: "15+10", label: "15 + 10", initialMs: 900_000, incrementMs: 10_000, category: "Rapid" },
  { id: "30+0", label: "30 + 0", initialMs: 1_800_000, incrementMs: 0, category: "Classical" },
  { id: "30+20", label: "30 + 20", initialMs: 1_800_000, incrementMs: 20_000, category: "Classical" },
  { id: "none", label: "No clock", initialMs: null, incrementMs: 0, category: "Casual" },
];

export const DEFAULT_TIME_CONTROL_ID = "5+3";

export function findTimeControl(initialMs: number | null, incrementMs: number): TimeControl | undefined {
  return TIME_CONTROLS.find((t) => t.initialMs === initialMs && t.incrementMs === incrementMs);
}

export function formatTimeControl(initialMs: number | null, incrementMs: number): string {
  if (initialMs == null) return "No clock";
  const mins = initialMs / 60_000;
  const m = Number.isInteger(mins) ? String(mins) : mins.toFixed(1);
  return `${m} + ${Math.round(incrementMs / 1000)}`;
}

export function timeControlCategory(initialMs: number | null, incrementMs: number): TimeControl["category"] {
  if (initialMs == null) return "Casual";
  // Lichess-style estimate: initial + 40 × increment
  const est = initialMs / 1000 + 40 * (incrementMs / 1000);
  if (est < 180) return "Bullet";
  if (est < 480) return "Blitz";
  if (est < 1500) return "Rapid";
  return "Classical";
}

/** How long an opponent must be gone before the game can be claimed. */
export const ABANDONMENT_MS = 90_000;
/** In games without a clock, a player who hasn't moved for this long can be claimed against. */
export const UNTIMED_MOVE_LIMIT_MS = 30 * 60_000;
/** Heartbeat interval for in-game presence. */
export const GAME_HEARTBEAT_MS = 10_000;
