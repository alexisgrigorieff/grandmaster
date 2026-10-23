"use client";

import { PieceIcon, NAMES } from "@/components/chess/PieceIcon";

export function PromotionPicker({ color, onPick, onCancel }: { color: "w" | "b"; onPick: (p: "q" | "r" | "b" | "n") => void; onCancel: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/45 backdrop-blur-[2px]" onClick={onCancel} data-testid="promotion-picker">
      <div className="card animate-rise p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <p className="mb-3 text-center text-[13px] font-medium text-muted">Promote to</p>
        <div className="flex gap-2">
          {(["q", "r", "b", "n"] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPick(p)}
              className="flex h-16 w-16 items-center justify-center rounded-[14px] bg-white/[0.04] ring-1 ring-inset ring-line transition hover:bg-accent/15 hover:ring-accent/50 sm:h-20 sm:w-20"
              aria-label={`Promote to ${NAMES[p]}`}
              data-promote={p}
              autoFocus={p === "q"}
            >
              <PieceIcon type={p} color={color} className="h-12 w-12 sm:h-14 sm:w-14" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
