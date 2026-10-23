"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ensureRealtimeAuth, getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { GAME_HEARTBEAT_MS } from "@/lib/chess/constants";

export type PresenceStatus = "available" | "playing" | "away" | "offline";

export interface PresenceMeta {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_preset: string;
  rating: number;
  status: Exclude<PresenceStatus, "offline">;
  game_id: string | null;
  online_at: string;
}

interface PresenceState {
  /** Everyone currently connected, keyed by user id (several tabs merge into one entry). */
  online: Map<string, PresenceMeta>;
  statusOf: (userId: string) => PresenceStatus;
  myStatus: PresenceStatus;
  manualAway: boolean;
  setManualAway: (v: boolean) => void;
  activeGameId: string | null;
  refreshActiveGame: () => Promise<string | null>;
  connected: boolean;
}

const Ctx = createContext<PresenceState>({
  online: new Map(),
  statusOf: () => "offline",
  myStatus: "offline",
  manualAway: false,
  setManualAway: () => {},
  activeGameId: null,
  refreshActiveGame: async () => null,
  connected: false,
});

const RANK: Record<PresenceMeta["status"], number> = { playing: 3, available: 2, away: 1 };
const IDLE_MS = 5 * 60_000;
const HIDDEN_AWAY_MS = 60_000;

function merge(state: Record<string, PresenceMeta[]>): Map<string, PresenceMeta> {
  const out = new Map<string, PresenceMeta>();
  for (const [key, metas] of Object.entries(state)) {
    if (!metas.length) continue;
    const best = [...metas].sort((a, b) => RANK[b.status] - RANK[a.status])[0];
    out.set(key, best);
  }
  return out;
}

/**
 * Real presence: a user is "online" only while at least one of their tabs
 * holds an open Realtime connection. Status is derived from their actual
 * state (in a game, tab hidden / idle, or manually away).
 */
export function PresenceProvider({ children }: { children: ReactNode }) {
  const { userId, profile } = useAuth();
  const [online, setOnline] = useState<Map<string, PresenceMeta>>(new Map());
  const [connected, setConnected] = useState(false);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [manualAway, setManualAwayState] = useState(false);
  const [autoAway, setAutoAway] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribed = useRef(false);

  const myStatus: PresenceStatus = !userId ? "offline" : activeGameId ? "playing" : manualAway || autoAway ? "away" : "available";

  const refreshActiveGame = useCallback(async () => {
    if (!userId) {
      setActiveGameId(null);
      return null;
    }
    const { data } = await getSupabase().from("active_players").select("game_id").eq("user_id", userId).maybeSingle();
    const id = (data?.game_id as string | undefined) ?? null;
    setActiveGameId(id);
    return id;
  }, [userId]);

  // Active game polling.
  useEffect(() => {
    if (!userId) return;
    void refreshActiveGame();
    const t = setInterval(refreshActiveGame, 15_000);
    const onFocus = () => void refreshActiveGame();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [userId, refreshActiveGame]);

  // In-game heartbeat (lets the opponent claim the game only if we really left).
  useEffect(() => {
    if (!userId || !activeGameId) return;
    const beat = () => void getSupabase().rpc("game_heartbeat", { p_game: activeGameId }).then(({ error }) => {
      if (error) void refreshActiveGame();
    });
    beat();
    const t = setInterval(beat, GAME_HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [userId, activeGameId, refreshActiveGame]);

  // Away detection: hidden tab or no input for a while.
  useEffect(() => {
    if (!userId) return;
    let idleTimer: ReturnType<typeof setTimeout>;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
    const activity = () => {
      setAutoAway((a) => (a && document.visibilityState === "visible" ? false : a));
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => setAutoAway(true), IDLE_MS);
    };
    const vis = () => {
      clearTimeout(hiddenTimer);
      if (document.visibilityState === "hidden") hiddenTimer = setTimeout(() => setAutoAway(true), HIDDEN_AWAY_MS);
      else activity();
    };
    activity();
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearTimeout(idleTimer);
      clearTimeout(hiddenTimer);
      events.forEach((e) => window.removeEventListener(e, activity));
      document.removeEventListener("visibilitychange", vis);
    };
  }, [userId]);

  // The presence channel itself.
  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    const channel = supabase.channel("presence:lobby", { config: { presence: { key: userId } } });
    channelRef.current = channel;
    let cancelled = false;
    channel.on("presence", { event: "sync" }, () => {
      setOnline(merge(channel.presenceState<PresenceMeta>() as unknown as Record<string, PresenceMeta[]>));
    });
    void ensureRealtimeAuth().then(() => {
      if (cancelled) return;
      channel.subscribe((status) => {
        subscribed.current = status === "SUBSCRIBED";
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") window.dispatchEvent(new Event("gm:presence-subscribed"));
      });
    });
    return () => {
      cancelled = true;
      subscribed.current = false;
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setOnline(new Map());
      setConnected(false);
    };
  }, [userId]);

  // (Re)announce ourselves whenever what others should see changes.
  const meta = useMemo<PresenceMeta | null>(() => {
    if (!userId || !profile) return null;
    return {
      user_id: userId,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      avatar_preset: profile.avatar_preset,
      rating: profile.rating,
      status: myStatus === "offline" ? "available" : myStatus,
      game_id: activeGameId,
      online_at: new Date().toISOString(),
    };
  }, [userId, profile, myStatus, activeGameId]);

  useEffect(() => {
    if (!meta) return;
    const track = () => {
      if (subscribed.current) void channelRef.current?.track(meta);
    };
    track();
    window.addEventListener("gm:presence-subscribed", track);
    return () => window.removeEventListener("gm:presence-subscribed", track);
  }, [meta]);

  const statusOf = useCallback((id: string): PresenceStatus => online.get(id)?.status ?? "offline", [online]);

  const value = useMemo<PresenceState>(
    () => ({
      online,
      statusOf,
      myStatus,
      manualAway,
      setManualAway: setManualAwayState,
      activeGameId,
      refreshActiveGame,
      connected,
    }),
    [online, statusOf, myStatus, manualAway, activeGameId, refreshActiveGame, connected],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePresence = () => useContext(Ctx);
