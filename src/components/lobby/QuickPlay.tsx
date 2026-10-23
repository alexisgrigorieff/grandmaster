"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { ensureRealtimeAuth, getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePresence } from "@/lib/realtime/presence";
import { DEFAULT_TIME_CONTROL_ID, TIME_CONTROLS } from "@/lib/chess/constants";
import { friendlyError } from "@/lib/errors";
import { playSound } from "@/lib/sound";
import { Button } from "@/components/ui";
import { toast } from "@/components/ui/Toaster";
import { TimeControlPicker } from "./TimeControlPicker";

type MMState = { status: "idle" } | { status: "joining" } | { status: "waiting"; since: number } | { status: "matched"; gameId: string };

/**
 * Quick play: join the matchmaking queue for a time control. Matching happens
 * atomically in Postgres; we poll (which doubles as our queue heartbeat) and
 * also listen for our queue row being matched in realtime.
 */
export function QuickPlay({ compact = false }: { compact?: boolean }) {
  const { userId } = useAuth();
  const { activeGameId, refreshActiveGame, online } = usePresence();
  const router = useRouter();
  const [tcId, setTcId] = useState(DEFAULT_TIME_CONTROL_ID);
  const [state, setState] = useState<MMState>({ status: "idle" });
  const [, tick] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const matched = useCallback(
    (gameId: string) => {
      if (stateRef.current.status === "matched") return;
      setState({ status: "matched", gameId });
      playSound("start");
      void refreshActiveGame();
      router.push(`/game/${gameId}`);
    },
    [router, refreshActiveGame],
  );

  const handle = useCallback(
    (res: { status: string; game_id: string | null } | null) => {
      if (!res) return;
      if (res.status === "matched" && res.game_id) matched(res.game_id);
      else if (res.status === "idle" && stateRef.current.status === "waiting") setState({ status: "idle" });
    },
    [matched],
  );

  // While waiting: heartbeat/poll + realtime notification.
  useEffect(() => {
    if (state.status !== "waiting" || !userId) return;
    const supabase = getSupabase();
    const poll = async () => {
      const { data, error } = await supabase.rpc("quick_play_poll");
      if (!error) handle(data as { status: string; game_id: string | null });
    };
    const t = setInterval(poll, 2500);
    const channel = supabase
      .channel(`mm:${userId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matchmaking_queue", filter: `user_id=eq.${userId}` }, (p) => {
        const row = p.new as { game_id: string | null };
        if (row.game_id) matched(row.game_id);
      });
    void ensureRealtimeAuth().then(() => channel.subscribe());
    const ticker = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      clearInterval(t);
      clearInterval(ticker);
      void supabase.removeChannel(channel);
    };
  }, [state.status, userId, handle, matched]);

  // Leave the queue if we navigate away while waiting.
  useEffect(
    () => () => {
      if (stateRef.current.status === "waiting") void getSupabase().rpc("quick_play_leave").then(() => {}); // query builders are lazy: .then() sends it
    },
    [],
  );

  async function join() {
    const tc = TIME_CONTROLS.find((t) => t.id === tcId)!;
    setState({ status: "joining" });
    const { data, error } = await getSupabase().rpc("quick_play_join", { p_initial_ms: tc.initialMs, p_increment_ms: tc.incrementMs });
    if (error) {
      setState({ status: "idle" });
      toast("Couldn't start matchmaking", { body: friendlyError(error), tone: "bad" });
      return;
    }
    const res = data as { status: string; game_id: string | null };
    if (res.status === "matched" && res.game_id) matched(res.game_id);
    else setState({ status: "waiting", since: Date.now() });
  }

  async function leave() {
    setState({ status: "idle" });
    await getSupabase().rpc("quick_play_leave");
  }

  const waiting = state.status === "waiting";
  const secs = waiting ? Math.floor((Date.now() - state.since) / 1000) : 0;
  const othersOnline = Math.max(0, online.size - (userId && online.has(userId) ? 1 : 0));

  if (activeGameId) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-[14px] text-muted">You have a game in progress.</p>
        <Button variant="primary" onClick={() => router.push(`/game/${activeGameId}`)}>
          Return to game
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="quick-play">
      {!waiting ? (
        <>
          <TimeControlPicker value={tcId} onChange={(tc) => setTcId(tc.id)} compact={compact} />
          <Button variant="primary" size="lg" className="mt-4 w-full" icon={<Zap className="h-4 w-4" />} loading={state.status === "joining" || state.status === "matched"} onClick={join} data-testid="quick-play-button">
            Quick play
          </Button>
          <p className="mt-2.5 text-center text-[12px] text-faint">
            {othersOnline > 0 ? `${othersOnline} other player${othersOnline === 1 ? "" : "s"} online` : "Nobody else is online right now — invite a friend!"}
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center py-4 text-center" data-testid="quick-play-waiting">
          <div className="relative h-16 w-16">
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
            <span className="absolute inset-2 flex items-center justify-center rounded-full bg-accent/15 ring-1 ring-accent/40">
              <Zap className="h-6 w-6 text-accent-2" />
            </span>
          </div>
          <p className="mt-4 text-[15px] font-medium text-text">Finding an opponent…</p>
          <p className="mt-1 text-[13px] text-muted tabular">
            {TIME_CONTROLS.find((t) => t.id === tcId)?.label} · {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
          </p>
          <Button variant="subtle" size="sm" className="mt-4" onClick={leave}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
