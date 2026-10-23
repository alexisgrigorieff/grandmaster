"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { clockRunning, formatClock, remainingClocks, sideToMove } from "@/lib/chess/clock";
import { serverNow } from "@/lib/serverTime";
import { playSound } from "@/lib/sound";
import type { Color, GameRow } from "@/lib/chess/types";

/** Live chess clock computed from server timestamps (never trusts local state). */
export function Clock({ game, color, mine }: { game: GameRow; color: Color; mine: boolean }) {
  const [, force] = useState(0);
  const warned = useRef(false);
  const running = clockRunning(game) && sideToMove(game) === color;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => force((n) => n + 1), 100);
    return () => clearInterval(t);
  }, [running]);

  const ms = remainingClocks(game, serverNow())[color];
  const low = ms != null && game.initial_ms != null && ms < Math.min(20_000, game.initial_ms * 0.15);

  useEffect(() => {
    if (mine && running && low && !warned.current) {
      warned.current = true;
      playSound("lowtime");
    }
  }, [mine, running, low]);

  if (game.initial_ms == null) return null;
  return (
    <div
      className={clsx(
        "tabular min-w-[92px] rounded-[12px] px-3 py-1.5 text-right text-[22px] font-semibold leading-none tracking-tight transition-colors sm:min-w-[108px] sm:text-[26px]",
        running
          ? low
            ? "bg-bad/90 text-white shadow-[0_0_30px_-6px_rgba(226,112,95,0.8)]"
            : "bg-[#f2ede4] text-[#141414] shadow-[0_8px_30px_-10px_rgba(242,237,228,0.5)]"
          : "bg-white/[0.04] text-muted ring-1 ring-inset ring-line",
      )}
      data-testid={`clock-${color}`}
      aria-label={`${color} clock`}
    >
      {formatClock(ms)}
    </div>
  );
}
