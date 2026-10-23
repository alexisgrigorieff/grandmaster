"use client";

import clsx from "clsx";
import { TIME_CONTROLS, type TimeControl } from "@/lib/chess/constants";

export function TimeControlPicker({ value, onChange, compact = false }: { value: string; onChange: (tc: TimeControl) => void; compact?: boolean }) {
  return (
    <div className={clsx("grid gap-2", compact ? "grid-cols-4" : "grid-cols-3 sm:grid-cols-4")} role="radiogroup" aria-label="Time control">
      {TIME_CONTROLS.map((tc) => (
        <button
          key={tc.id}
          type="button"
          role="radio"
          aria-checked={value === tc.id}
          onClick={() => onChange(tc)}
          data-tc={tc.id}
          className={clsx(
            "group rounded-[12px] px-2 py-2.5 text-center ring-1 ring-inset transition-all",
            value === tc.id ? "bg-accent/12 ring-accent/60" : "bg-white/[0.025] ring-line hover:bg-white/[0.05] hover:ring-line-2",
          )}
        >
          <span className={clsx("block text-[15px] font-semibold tabular", value === tc.id ? "text-accent-2" : "text-text")}>{tc.id === "none" ? "∞" : tc.label}</span>
          <span className="block text-[11px] text-faint">{tc.id === "none" ? "No clock" : tc.category}</span>
        </button>
      ))}
    </div>
  );
}
