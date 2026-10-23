"use client";

import { Check, X } from "lucide-react";
import { useChallenges } from "@/lib/realtime/challenges";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui";
import { ChallengeCountdown, challengeSummary } from "./IncomingChallenges";

export function ChallengesPanel() {
  const { incoming, outgoing, accept, decline, cancel, busy } = useChallenges();
  if (!incoming.length && !outgoing.length) {
    return <p className="px-1 text-[13px] text-faint">No open challenges. Pick someone from the list to challenge them.</p>;
  }
  return (
    <div className="space-y-2" data-testid="challenges-panel">
      {incoming.map((c) => (
        <div key={c.id} className="overflow-hidden rounded-[14px] bg-accent/[0.07] ring-1 ring-inset ring-accent/25">
          <div className="flex items-center gap-3 p-3">
            <Avatar user={c.other} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-text">{c.other?.display_name ?? "…"}</p>
              <p className="truncate text-[12px] text-muted">{challengeSummary(c, "receiver")}</p>
            </div>
            <Button size="sm" variant="primary" loading={busy === c.id} onClick={() => accept(c.id)} aria-label="Accept">
              <Check className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="subtle" disabled={busy === c.id} onClick={() => decline(c.id)} aria-label="Decline">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ChallengeCountdown createdAt={c.created_at} expiresAt={c.expires_at} />
        </div>
      ))}
      {outgoing.map((c) => (
        <div key={c.id} className="overflow-hidden rounded-[14px] bg-white/[0.025] ring-1 ring-inset ring-line" data-testid="outgoing-challenge">
          <div className="flex items-center gap-3 p-3">
            <Avatar user={c.other} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] text-text">
                Waiting for <span className="font-medium">{c.other?.display_name ?? "…"}</span>
              </p>
              <p className="truncate text-[12px] text-muted">{challengeSummary(c, "sender")}</p>
            </div>
            <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => cancel(c.id)}>
              Cancel
            </Button>
          </div>
          <ChallengeCountdown createdAt={c.created_at} expiresAt={c.expires_at} />
        </div>
      ))}
    </div>
  );
}
