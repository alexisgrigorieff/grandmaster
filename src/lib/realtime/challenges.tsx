"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ensureRealtimeAuth, getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePresence } from "@/lib/realtime/presence";
import { friendlyError } from "@/lib/errors";
import { playSound } from "@/lib/sound";
import { toast } from "@/components/ui/Toaster";
import { serverNow } from "@/lib/serverTime";
import type { Challenge, PublicProfile } from "@/lib/chess/types";

export interface ChallengeWithPlayer extends Challenge {
  other: PublicProfile | null;
}

export interface ChallengeOptions {
  color: "white" | "black" | "random";
  initialMs: number | null;
  incrementMs: number;
  rated: boolean;
}

interface ChallengeState {
  incoming: ChallengeWithPlayer[];
  outgoing: ChallengeWithPlayer[];
  send: (to: PublicProfile, opts: ChallengeOptions) => Promise<boolean>;
  accept: (id: string) => Promise<void>;
  decline: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  busy: string | null;
}

const Ctx = createContext<ChallengeState>({
  incoming: [],
  outgoing: [],
  send: async () => false,
  accept: async () => {},
  decline: async () => {},
  cancel: async () => {},
  busy: null,
});

const PUBLIC_COLS = "id, username, display_name, avatar_url, avatar_preset, rating";

export function ChallengeProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const { refreshActiveGame } = usePresence();
  const router = useRouter();
  const [rows, setRows] = useState<Challenge[]>([]);
  const [profiles, setProfiles] = useState<Map<string, PublicProfile>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [, tick] = useState(0);
  const seen = useRef(new Set<string>());
  const navigated = useRef(new Set<string>());

  const ensureProfiles = useCallback(async (ids: string[]) => {
    const missing = ids.filter((id) => !profiles.has(id));
    if (!missing.length) return;
    const { data } = await getSupabase().from("profiles").select(PUBLIC_COLS).in("id", missing);
    if (data) setProfiles((m) => new Map([...m, ...data.map((p) => [p.id, p as PublicProfile] as const)]));
  }, [profiles]);

  const goToGame = useCallback(
    (gameId: string) => {
      if (navigated.current.has(gameId)) return;
      navigated.current.add(gameId);
      void refreshActiveGame();
      router.push(`/game/${gameId}`);
    },
    [router, refreshActiveGame],
  );

  /** Last status we observed for each challenge in this session. */
  const known = useRef(new Map<string, Challenge["status"]>());

  const upsert = useCallback(
    (c: Challenge) => {
      setRows((rs) => {
        const i = rs.findIndex((r) => r.id === c.id);
        if (i === -1) return [...rs, c];
        const copy = [...rs];
        copy[i] = c;
        return copy;
      });
      const other = c.from_id === userId ? c.to_id : c.from_id;
      void ensureProfiles([other]);

      // Only react to transitions we witnessed — never to history loaded on page load.
      const prev = known.current.get(c.id);
      known.current.set(c.id, c.status);
      if (prev === c.status) return;

      if (c.to_id === userId && c.status === "pending" && prev === undefined && !seen.current.has(c.id)) {
        seen.current.add(c.id);
        playSound("notify");
      }
      if (c.from_id === userId && prev === "pending") {
        if (c.status === "accepted" && c.game_id) {
          playSound("start");
          goToGame(c.game_id);
        } else if (c.status === "declined") {
          toast("Challenge declined", { body: "Maybe next time.", tone: "neutral" });
        }
      }
    },
    [userId, ensureProfiles, goToGame],
  );

  const load = useCallback(async () => {
    if (!userId) return;
    const since = new Date(serverNow() - 5 * 60_000).toISOString();
    const { data } = await getSupabase()
      .from("challenges")
      .select("*")
      .or(`from_id.eq.${userId},to_id.eq.${userId}`)
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    for (const c of (data as Challenge[] | null) ?? []) upsert(c);
  }, [userId, upsert]);

  // Realtime + polling fallback.
  useEffect(() => {
    if (!userId) {
      setRows([]);
      return;
    }
    const supabase = getSupabase();
    void load();
    const channel = supabase
      .channel(`challenges:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges", filter: `to_id=eq.${userId}` }, (p) => upsert(p.new as Challenge))
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges", filter: `from_id=eq.${userId}` }, (p) => upsert(p.new as Challenge));
    let cancelled = false;
    void ensureRealtimeAuth().then(() => {
      if (!cancelled)
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") void load();
        });
    });
    const poll = setInterval(load, 8_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [userId, load, upsert]);

  // Re-render every second so expiry countdowns update and stale ones vanish.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const now = serverNow();
  const live = rows.filter((r) => r.status === "pending" && Date.parse(r.expires_at) > now);
  const withPlayer = (c: Challenge): ChallengeWithPlayer => ({ ...c, other: profiles.get(c.from_id === userId ? c.to_id : c.from_id) ?? null });
  const incoming = live.filter((r) => r.to_id === userId).map(withPlayer);
  const outgoing = live.filter((r) => r.from_id === userId).map(withPlayer);

  const send = useCallback(
    async (to: PublicProfile, opts: ChallengeOptions) => {
      setBusy(`send:${to.id}`);
      setProfiles((m) => new Map(m).set(to.id, to));
      const { data, error } = await getSupabase().rpc("create_challenge", {
        p_to: to.id,
        p_color: opts.color,
        p_initial_ms: opts.initialMs,
        p_increment_ms: opts.incrementMs,
        p_rated: opts.rated,
      });
      setBusy(null);
      if (error) {
        toast("Couldn't send challenge", { body: friendlyError(error), tone: "bad" });
        return false;
      }
      upsert(data as Challenge);
      return true;
    },
    [upsert],
  );

  const respond = useCallback(
    async (id: string, accept: boolean) => {
      setBusy(id);
      const { data, error } = await getSupabase().rpc("respond_challenge", { p_challenge: id, p_accept: accept });
      setBusy(null);
      if (error) {
        toast(accept ? "Couldn't accept" : "Couldn't decline", { body: friendlyError(error), tone: "bad" });
        void load();
        return;
      }
      const c = data as Challenge;
      upsert(c);
      if (c.status === "accepted" && c.game_id) {
        playSound("start");
        goToGame(c.game_id);
      } else if (c.status === "expired") {
        toast("That challenge expired", { tone: "neutral" });
      }
    },
    [upsert, goToGame, load],
  );

  const cancel = useCallback(
    async (id: string) => {
      setBusy(id);
      const { data, error } = await getSupabase().rpc("cancel_challenge", { p_challenge: id });
      setBusy(null);
      if (error) void load();
      else upsert(data as Challenge);
    },
    [upsert, load],
  );

  // Not memoised on purpose: consumers re-render each second for countdowns.
  const value: ChallengeState = { incoming, outgoing, send, accept: (id) => respond(id, true), decline: (id) => respond(id, false), cancel, busy };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useChallenges = () => useContext(Ctx);
