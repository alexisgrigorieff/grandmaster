"use client";

import Link from "next/link";
import clsx from "clsx";
import type { PieceSymbol } from "chess.js";
import { Avatar } from "@/components/ui/Avatar";
import { StatusDot } from "@/components/layout/StatusDot";
import { PieceIcon } from "@/components/chess/PieceIcon";
import { sortCaptured } from "@/lib/chess/pieces";
import type { Color, GameRow, PublicProfile } from "@/lib/chess/types";
import type { PresenceStatus } from "@/lib/realtime/presence";
import { Clock } from "./Clock";

export function PlayerStrip({
  game,
  player,
  color,
  mine,
  status,
  capturedFromOpponent,
  advantage,
  toMove,
  connectionNote,
}: {
  game: GameRow;
  player: PublicProfile | null;
  color: Color;
  mine: boolean;
  status: PresenceStatus;
  /** Opponent pieces this player has captured. */
  capturedFromOpponent: PieceSymbol[];
  advantage: number;
  toMove: boolean;
  connectionNote?: string | null;
}) {
  const diff = color === "white" ? game.white_rating_diff : game.black_rating_diff;
  const capturedColor = color === "white" ? "b" : "w";
  return (
    <div className={clsx("flex items-center gap-3 rounded-[14px] px-2 py-2 transition-colors sm:px-3", toMove && game.status === "active" && "bg-white/[0.03]")} data-testid={`player-${color}`}>
      <Avatar user={player} size="md" status={<StatusDot status={status} />} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {player ? (
            <Link href={`/profile/${player.username}`} className="truncate text-[15px] font-semibold text-text hover:underline">
              {player.display_name}
            </Link>
          ) : (
            <span className="h-4 w-24 animate-pulse rounded bg-white/10" />
          )}
          {mine && <span className="rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-faint">You</span>}
          <span className="tabular text-[13px] text-faint">{player?.rating ?? ""}</span>
          {diff != null && (
            <span className={clsx("tabular text-[12px] font-semibold", diff > 0 ? "text-ok" : diff < 0 ? "text-bad" : "text-faint")}>
              {diff > 0 ? `+${diff}` : diff}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex h-[18px] items-center gap-1.5">
          {connectionNote ? (
            <span className="text-[12px] text-warn">{connectionNote}</span>
          ) : (
            <>
              <span className="flex items-center -space-x-1.5">
                {sortCaptured(capturedFromOpponent).map((t, i) => (
                  <PieceIcon key={i} type={t} color={capturedColor} className="h-[18px] w-[18px]" />
                ))}
              </span>
              {advantage > 0 && <span className="tabular text-[12px] font-medium text-faint">+{advantage}</span>}
            </>
          )}
        </div>
      </div>
      <Clock game={game} color={color} mine={mine} />
    </div>
  );
}
