"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider } from "@/lib/auth";
import { PresenceProvider } from "@/lib/realtime/presence";
import { ChallengeProvider } from "@/lib/realtime/challenges";
import { Toaster } from "@/components/ui/Toaster";
import { PieceGradients } from "@/components/chess/PieceIcon";
import { IncomingChallenges } from "@/components/lobby/IncomingChallenges";
import { unlockAudio } from "@/lib/sound";
import { syncServerTime } from "@/lib/serverTime";
import type { Profile } from "@/lib/chess/types";

export function Providers({ children, initialUserId, initialProfile }: { children: ReactNode; initialUserId: string | null; initialProfile: Profile | null }) {
  useEffect(() => {
    syncServerTime();
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);
  return (
    <AuthProvider initialUserId={initialUserId} initialProfile={initialProfile}>
      <PresenceProvider>
        <ChallengeProvider>
          <PieceGradients />
          {children}
          <IncomingChallenges />
          <Toaster />
        </ChallengeProvider>
      </PresenceProvider>
    </AuthProvider>
  );
}
