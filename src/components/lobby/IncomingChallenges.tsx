"use client";

import { Check, X } from "lucide-react";
import { useChallenges, type ChallengeWithPlayer } from "@/lib/realtime/challenges";
import { formatTimeControl } from "@/lib/chess/constants";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui";
import { serverNow } from "@/lib/serverTime";

export function challengeSummary(c: Pick<ChallengeWithPlayer, "initial_ms" | "increment_ms" | "rated" | "color">, perspective: "sender" | "receiver") {
  const tc = formatTimeControl(c.initial_ms, c.increment_ms);
  let color = "random colours";
  if (c.color !== "random") {
    const senderColor = c.color;
    const mine = perspective === "sender" ? senderColor : senderColor === "white" ? "black" : "white";
    color = `you play ${mine}`;
  }
  return `${tc} · ${c.rated ? "Rated" : "Casual"} · ${color}`;
}

export function ChallengeCountdown({ createdAt, expiresAt }: { createdAt: string; expiresAt: string }) {
  const total = Math.max(1, Date.parse(expiresAt) - Date.parse(createdAt));
  const left = Math.max(0, Date.parse(expiresAt) - serverNow());
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        className="h-full origin-left rounded-full bg-accent transition-transform duration-1000 ease-linear"
        style={{ transform: `scaleX(${left / total})` }}
      />
    </div>
  );
}

/** Floating cards for challenges sent to me — visible on every page. */
export function IncomingChallenges() {
  const { incoming, accept, decline, busy } = useChallenges();
  if (!incoming.length) return null;
  return (
    <div className="fixed inset-x-3 top-16 z-[90] flex flex-col gap-2 sm:inset-x-auto sm:right-5 sm:top-20 sm:w-[360px]" aria-live="assertive">
      {incoming.slice(0, 3).map((c) => (
        <div key={c.id} className="card animate-rise overflow-hidden border-accent/30 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.95)]" data-testid="incoming-challenge">
          <div className="flex items-center gap-3 p-4">
            <Avatar user={c.other} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-text">
                <span className="font-semibold">{c.other?.display_name ?? "A player"}</span> challenges you
              </p>
              <p className="truncate text-[12px] text-muted">
                {c.other ? `${c.other.rating} · ` : ""}
                {challengeSummary(c, "receiver")}
              </p>
            </div>
          </div>
          <div className="flex gap-2 px-4 pb-3">
            <Button variant="primary" size="sm" className="flex-1" icon={<Check className="h-4 w-4" />} loading={busy === c.id} onClick={() => accept(c.id)} data-testid="accept-challenge">
              Accept
            </Button>
            <Button variant="subtle" size="sm" className="flex-1" icon={<X className="h-4 w-4" />} disabled={busy === c.id} onClick={() => decline(c.id)} data-testid="decline-challenge">
              Decline
            </Button>
          </div>
          <ChallengeCountdown createdAt={c.created_at} expiresAt={c.expires_at} />
        </div>
      ))}
    </div>
  );
}
