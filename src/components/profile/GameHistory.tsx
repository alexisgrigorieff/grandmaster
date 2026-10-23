"use client";

import Link from "next/link";
import clsx from "clsx";
import { History } from "lucide-react";
import { formatTimeControl } from "@/lib/chess/constants";
import { TERMINATION_LABEL } from "@/lib/chess/rules";
import type { Termination } from "@/lib/chess/types";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState, Skeleton } from "@/components/ui";

export interface HistoryRow {
  id: string;
  created_at: string;
  finished_at: string;
  color: "white" | "black";
  result: string;
  termination: Termination | null;
  outcome: "win" | "loss" | "draw";
  initial_ms: number | null;
  increment_ms: number;
  rated: boolean;
  rating_diff: number | null;
  ply: number;
  opponent_id: string;
  opponent_username: string;
  opponent_display_name: string;
  opponent_avatar_url: string | null;
  opponent_avatar_preset: string;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

export function GameHistory({ rows, canOpen, emptyBody }: { rows: HistoryRow[] | null; canOpen: boolean; emptyBody?: string }) {
  if (rows === null) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }
  if (!rows.length) return <EmptyState icon={<History className="h-8 w-8" />} title="No finished games yet" body={emptyBody} />;
  return (
    <ul className="divide-y divide-line" data-testid="game-history">
      {rows.map((r) => {
        const inner = (
          <div className="flex items-center gap-3 px-4 py-3">
            <span
              className={clsx(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[12px] font-bold",
                r.outcome === "win" ? "bg-ok/12 text-ok" : r.outcome === "loss" ? "bg-bad/12 text-bad" : "bg-white/[0.06] text-muted",
              )}
              title={r.outcome}
            >
              {r.outcome === "win" ? "W" : r.outcome === "loss" ? "L" : "D"}
            </span>
            <Avatar user={{ avatar_url: r.opponent_avatar_url, avatar_preset: r.opponent_avatar_preset }} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-text">
                vs <span className="font-medium">{r.opponent_display_name}</span>
                <span className="ml-1.5 text-[12px] text-faint">as {r.color}</span>
              </p>
              <p className="truncate text-[12px] text-faint">
                {r.termination ? TERMINATION_LABEL[r.termination] : r.result} · {Math.ceil(r.ply / 2)} moves · {formatTimeControl(r.initial_ms, r.increment_ms)}
                {r.rated ? "" : " · casual"}
              </p>
            </div>
            <div className="text-right">
              {r.rating_diff != null && (
                <p className={clsx("tabular text-[13px] font-semibold", r.rating_diff > 0 ? "text-ok" : r.rating_diff < 0 ? "text-bad" : "text-faint")}>
                  {r.rating_diff > 0 ? `+${r.rating_diff}` : r.rating_diff}
                </p>
              )}
              <p className="text-[12px] text-faint">{fmtDate(r.finished_at)}</p>
            </div>
          </div>
        );
        return (
          <li key={r.id}>
            {canOpen ? (
              <Link href={`/game/${r.id}`} className="block transition-colors hover:bg-white/[0.025]" title="Replay this game">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
