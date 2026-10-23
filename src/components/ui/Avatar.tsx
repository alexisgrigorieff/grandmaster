"use client";

import clsx from "clsx";
import type { PieceSymbol } from "chess.js";
import { PieceIcon } from "@/components/chess/PieceIcon";
import { SUPABASE_URL } from "@/lib/env";

const AVATAR_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/avatars/`;
/** Only show photos hosted in our own avatars bucket (never arbitrary third-party URLs). */
const safeUrl = (u: string | null | undefined) => (u && SUPABASE_URL && u.startsWith(AVATAR_PREFIX) ? u : null);

export const AVATAR_PIECES: { id: string; type: PieceSymbol }[] = [
  { id: "knight", type: "n" },
  { id: "queen", type: "q" },
  { id: "king", type: "k" },
  { id: "rook", type: "r" },
  { id: "bishop", type: "b" },
  { id: "pawn", type: "p" },
];

export const AVATAR_COLORS: Record<string, [string, string]> = {
  amber: ["#E8C27C", "#9C6A24"],
  jade: ["#86D3A8", "#2E7A55"],
  ruby: ["#F08A7E", "#9B2F2A"],
  sapphire: ["#8DB4F5", "#2E4F9B"],
  violet: ["#C3A6F7", "#5E3AA6"],
  slate: ["#B5BBC6", "#4A5160"],
  ember: ["#F5A86A", "#A3471C"],
  ivory: ["#F4EEE2", "#B7A88C"],
};

export function parsePreset(preset: string | null | undefined): { type: PieceSymbol; colors: [string, string] } {
  const [piece, color] = (preset ?? "knight-amber").split("-");
  const type = AVATAR_PIECES.find((p) => p.id === piece)?.type ?? "n";
  return { type, colors: AVATAR_COLORS[color] ?? AVATAR_COLORS.amber };
}

export interface AvatarData {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  avatar_preset?: string | null;
}

const SIZES = { xs: "h-6 w-6", sm: "h-8 w-8", md: "h-10 w-10", lg: "h-14 w-14", xl: "h-24 w-24" };

export function Avatar({ user, size = "md", className, status }: { user: AvatarData | null | undefined; size?: keyof typeof SIZES; className?: string; status?: React.ReactNode }) {
  const { type, colors } = parsePreset(user?.avatar_preset);
  const url = safeUrl(user?.avatar_url);
  return (
    <span className={clsx("relative inline-flex shrink-0", SIZES[size], className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full rounded-full object-cover ring-1 ring-white/10" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full ring-1 ring-white/10"
          style={{ background: `radial-gradient(120% 120% at 30% 20%, ${colors[0]}, ${colors[1]})` }}
          aria-hidden
        >
          <PieceIcon type={type} color="b" className="h-[66%] w-[66%] opacity-90" title="" />
        </span>
      )}
      {status && <span className="absolute -bottom-0.5 -right-0.5">{status}</span>}
    </span>
  );
}
