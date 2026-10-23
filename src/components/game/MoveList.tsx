"use client";

import { useEffect, useRef } from "react";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import type { Move } from "chess.js";

export function MoveList({
  moves,
  viewPly,
  onSelect,
  className,
}: {
  moves: Move[];
  /** Ply currently shown on the board (moves.length = live). */
  viewPly: number;
  onSelect: (ply: number) => void;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const total = moves.length;

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-ply="${viewPly}"]`);
    if (el && listRef.current) {
      const box = listRef.current;
      const top = el.offsetTop - box.clientHeight / 2;
      box.scrollTo({ top, behavior: "smooth" });
    } else if (viewPly === total && listRef.current) {
      listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [viewPly, total]);

  // Keyboard navigation.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      if (e.key === "ArrowLeft") onSelect(Math.max(0, viewPly - 1));
      else if (e.key === "ArrowRight") onSelect(Math.min(total, viewPly + 1));
      else if (e.key === "ArrowUp" || e.key === "Home") onSelect(0);
      else if (e.key === "ArrowDown" || e.key === "End") onSelect(total);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [viewPly, total, onSelect]);

  const rows: { n: number; w?: Move; b?: Move }[] = [];
  for (let i = 0; i < moves.length; i += 2) rows.push({ n: i / 2 + 1, w: moves[i], b: moves[i + 1] });

  const cell = (m: Move | undefined, ply: number) =>
    m ? (
      <button
        data-ply={ply}
        onClick={() => onSelect(ply)}
        className={clsx(
          "tabular rounded-[8px] px-2 py-1 text-left text-[14px] transition-colors",
          ply === viewPly ? "bg-accent/18 font-semibold text-accent-2" : "text-text/90 hover:bg-white/[0.05]",
        )}
      >
        {m.san}
      </button>
    ) : (
      <span />
    );

  return (
    <div className={clsx("flex min-h-0 flex-col", className)} data-testid="move-list">
      <div ref={listRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-faint">No moves yet. White to play.</p>
        ) : (
          <div className="grid grid-cols-[2.25rem_1fr_1fr] gap-x-1 gap-y-0.5">
            {rows.map((r) => (
              <div key={r.n} className="contents">
                <span className="tabular py-1 pl-2 text-[13px] text-faint">{r.n}.</span>
                {cell(r.w, r.n * 2 - 1)}
                {cell(r.b, r.n * 2)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1 border-t border-line p-1.5">
        {[
          { icon: ChevronsLeft, to: 0, label: "First move" },
          { icon: ChevronLeft, to: Math.max(0, viewPly - 1), label: "Previous move" },
          { icon: ChevronRight, to: Math.min(total, viewPly + 1), label: "Next move" },
          { icon: ChevronsRight, to: total, label: "Latest move" },
        ].map(({ icon: Icon, to, label }) => (
          <button
            key={label}
            onClick={() => onSelect(to)}
            disabled={to === viewPly}
            aria-label={label}
            title={label}
            className="flex h-9 items-center justify-center rounded-[10px] text-muted transition hover:bg-white/[0.05] hover:text-text disabled:opacity-30"
          >
            <Icon className="h-[18px] w-[18px]" />
          </button>
        ))}
      </div>
    </div>
  );
}
