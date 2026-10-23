import clsx from "clsx";
import type { PresenceStatus } from "@/lib/realtime/presence";

export const STATUS_LABEL: Record<PresenceStatus, string> = {
  available: "Available",
  playing: "Playing",
  away: "Away",
  offline: "Offline",
};

const COLORS: Record<PresenceStatus, string> = {
  available: "bg-ok shadow-[0_0_0_3px_rgba(115,194,144,0.16)]",
  playing: "bg-accent shadow-[0_0_0_3px_rgba(214,170,92,0.18)]",
  away: "bg-transparent ring-2 ring-inset ring-away",
  offline: "bg-[#4a4a52]",
};

export function StatusDot({ status, className, ring = true }: { status: PresenceStatus; className?: string; ring?: boolean }) {
  return (
    <span
      className={clsx("inline-block h-2.5 w-2.5 rounded-full", COLORS[status], ring && "outline outline-2 outline-[var(--surface)]", className)}
      title={STATUS_LABEL[status]}
      aria-label={STATUS_LABEL[status]}
    />
  );
}
