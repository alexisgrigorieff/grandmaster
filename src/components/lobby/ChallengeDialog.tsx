"use client";

import { useState } from "react";
import { Swords } from "lucide-react";
import { useChallenges } from "@/lib/realtime/challenges";
import { DEFAULT_TIME_CONTROL_ID, TIME_CONTROLS } from "@/lib/chess/constants";
import type { PublicProfile } from "@/lib/chess/types";
import { Button, Dialog, Segmented, Toggle } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { TimeControlPicker } from "./TimeControlPicker";

export function ChallengeDialog({ target, onClose }: { target: PublicProfile | null; onClose: () => void }) {
  const { send, busy } = useChallenges();
  const [tcId, setTcId] = useState(DEFAULT_TIME_CONTROL_ID);
  const [color, setColor] = useState<"random" | "white" | "black">("random");
  const [rated, setRated] = useState(true);

  async function submit() {
    if (!target) return;
    const tc = TIME_CONTROLS.find((t) => t.id === tcId)!;
    const ok = await send(target, { color, initialMs: tc.initialMs, incrementMs: tc.incrementMs, rated: rated && tc.initialMs != null });
    if (ok) onClose();
  }

  return (
    <Dialog
      open={Boolean(target)}
      onClose={onClose}
      size="lg"
      title={
        target && (
          <span className="flex items-center gap-3">
            <Avatar user={target} size="md" />
            <span>
              Challenge {target.display_name}
              <span className="block font-sans text-[13px] font-normal text-faint">
                @{target.username} · {target.rating}
              </span>
            </span>
          </span>
        )
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Swords className="h-4 w-4" />} loading={busy === `send:${target?.id}`} onClick={submit} data-testid="send-challenge">
            Send challenge
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-[13px] font-medium text-muted">Time control</p>
          <TimeControlPicker value={tcId} onChange={(tc) => setTcId(tc.id)} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-muted">You play</p>
          <Segmented
            value={color}
            onChange={setColor}
            options={[
              { value: "white", label: "White" },
              { value: "random", label: "Random" },
              { value: "black", label: "Black" },
            ]}
          />
        </div>
        <div className="border-t border-line">
          {tcId === "none" ? (
            <p className="py-3 text-[13px] text-faint">Games without a clock are always casual (unrated).</p>
          ) : (
            <Toggle checked={rated} onChange={setRated} label="Rated" description="Win or lose rating points." />
          )}
        </div>
      </div>
    </Dialog>
  );
}
