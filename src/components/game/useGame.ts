"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Move, type Square } from "chess.js";
import { ensureRealtimeAuth, getSupabase } from "@/lib/supabase/client";
import { observeServerTime, serverNow } from "@/lib/serverTime";
import { claimableDraw, opposite, parseUci, replay as replayGame } from "@/lib/chess/rules";
import { remainingClocks, sideToMove } from "@/lib/chess/clock";
import { trackPieces } from "@/lib/chess/pieces";
import { PUBLIC_PROFILE_COLUMNS, type Color, type GameAction, type GameRow, type PublicProfile } from "@/lib/chess/types";
import { playSound, soundForSan } from "@/lib/sound";
import { friendlyError } from "@/lib/errors";
import { toast } from "@/components/ui/Toaster";
import type { MoveTarget } from "@/components/board/types";

export interface ChatMessage {
  id: number;
  game_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

type LoadState = "loading" | "ready" | "not_found" | "error";

interface ApiResponse {
  game?: GameRow | null;
  rematch?: GameRow;
  error?: string;
  message?: string;
  serverNow?: number;
}

/**
 * Everything the game room needs: the authoritative game row (kept in sync via
 * Realtime with polling as a safety net), optimistic local moves, derived
 * board state, clocks and actions.
 */
export function useGame(gameId: string, userId: string | null) {
  const [game, setGame] = useState<GameRow | null>(null);
  const [load, setLoad] = useState<LoadState>("loading");
  const [players, setPlayers] = useState<{ white: PublicProfile | null; black: PublicProfile | null }>({ white: null, black: null });
  const [pending, setPending] = useState<{ uci: string; ply: number } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [live, setLive] = useState(false);
  const [busyAction, setBusyAction] = useState<GameAction | null>(null);
  const gameRef = useRef<GameRow | null>(null);
  const soundPly = useRef<number | null>(null);
  const flagRequested = useRef<number>(-1);

  /** Accept a server row only if it is at least as new as what we have. */
  const accept = useCallback((row: GameRow | null | undefined) => {
    if (!row || row.id !== gameId) return;
    const cur = gameRef.current;
    if (cur && row.version < cur.version) return;
    gameRef.current = row;
    setGame(row);
    setPending((p) => (p && row.ply > p.ply ? null : p));
  }, [gameId]);

  const fetchGame = useCallback(async () => {
    const { data, error } = await getSupabase().from("games").select("*").eq("id", gameId).maybeSingle();
    if (error) {
      setLoad((l) => (l === "ready" ? l : "error"));
      return;
    }
    if (!data) {
      setLoad("not_found");
      return;
    }
    accept(data as GameRow);
    setLoad("ready");
  }, [gameId, accept]);

  // Initial load + players.
  useEffect(() => {
    gameRef.current = null;
    setGame(null);
    setLoad("loading");
    setPending(null);
    setMessages([]);
    void fetchGame();
  }, [fetchGame]);

  useEffect(() => {
    if (!game) return;
    if (players.white?.id === game.white_id && players.black?.id === game.black_id) return;
    void getSupabase()
      .from("profiles")
      .select(PUBLIC_PROFILE_COLUMNS)
      .in("id", [game.white_id, game.black_id])
      .then(({ data }) => {
        const by = new Map((data as PublicProfile[] | null)?.map((p) => [p.id, p]) ?? []);
        setPlayers({ white: by.get(game.white_id) ?? null, black: by.get(game.black_id) ?? null });
      });
  }, [game, players.white?.id, players.black?.id]);

  // Ratings change at the end of a game: refresh the player cards.
  useEffect(() => {
    if (!game || game.status !== "finished") return;
    void getSupabase()
      .from("profiles")
      .select(PUBLIC_PROFILE_COLUMNS)
      .in("id", [game.white_id, game.black_id])
      .then(({ data }) => {
        const by = new Map((data as PublicProfile[] | null)?.map((p) => [p.id, p]) ?? []);
        setPlayers({ white: by.get(game.white_id) ?? null, black: by.get(game.black_id) ?? null });
      });
  }, [game?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chat history.
  useEffect(() => {
    void getSupabase()
      .from("game_messages")
      .select("*")
      .eq("game_id", gameId)
      .order("id", { ascending: true })
      .limit(200)
      .then(({ data }) => setMessages((data as ChatMessage[] | null) ?? []));
  }, [gameId]);

  // Realtime subscription + fallbacks.
  useEffect(() => {
    const supabase = getSupabase();
    let cancelled = false;
    const channel = supabase
      .channel(`game:${gameId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` }, (p) => {
        const row = p.new as Partial<GameRow>;
        if (!row || !("version" in row) || !Array.isArray(row.moves) || (p as { errors?: unknown }).errors) void fetchGame();
        else accept(row as GameRow);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "game_messages", filter: `game_id=eq.${gameId}` }, (p) => {
        const m = p.new as ChatMessage;
        setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m]));
      });
    void ensureRealtimeAuth().then(() => {
      if (cancelled) return;
      channel.subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void fetchGame(); // catch up on anything missed while (re)connecting
      });
    });
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [gameId, fetchGame, accept]);

  useEffect(() => {
    const ms = live ? 20_000 : 2_500;
    const t = setInterval(() => {
      if (document.visibilityState === "visible" || !live) void fetchGame();
    }, ms);
    const wake = () => {
      if (document.visibilityState === "visible") void fetchGame();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [live, fetchGame]);

  // ---------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------
  const myColor: Color | null = game && userId ? (game.white_id === userId ? "white" : game.black_id === userId ? "black" : null) : null;

  const moves = useMemo(() => {
    if (!game) return [];
    const list = game.moves.map((m) => m.u);
    if (pending && pending.ply === game.ply && game.status === "active") list.push(pending.uci);
    return list;
  }, [game, pending]);

  const derived = useMemo(() => {
    if (!game) return null;
    try {
      const r = replayGame(game.initial_fen, moves.map((u) => ({ u })));
      return r;
    } catch {
      // Optimistic move no longer applies; fall back to the server position.
      return replayGame(game.initial_fen, game.moves);
    }
  }, [game, moves]);

  // Sounds for moves we didn't make locally (opponent moves, or catch-up).
  useEffect(() => {
    if (!derived || !game) return;
    const ply = derived.verbose.length;
    if (soundPly.current == null) {
      soundPly.current = ply;
      return;
    }
    if (ply > soundPly.current) {
      const last = derived.verbose[ply - 1];
      playSound(soundForSan(last.san));
    }
    soundPly.current = ply;
  }, [derived, game]);

  // End of game sound.
  const prevStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!game) return;
    if (prevStatus.current === "active" && game.status !== "active") playSound("end");
    prevStatus.current = game.status;
  }, [game]);

  const legal = useMemo(() => {
    const map = new Map<Square, MoveTarget[]>();
    if (!game || !derived || !myColor || game.status !== "active" || pending) return map;
    if (sideToMove({ fen: derived.chess.fen() }) !== myColor) return map;
    for (const m of derived.chess.moves({ verbose: true }) as Move[]) {
      const list = map.get(m.from) ?? [];
      if (!list.some((t) => t.to === m.to)) list.push({ to: m.to, capture: Boolean(m.captured), promotion: Boolean(m.promotion) });
      map.set(m.from, list);
    }
    return map;
  }, [game, derived, myColor, pending]);

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  const post = useCallback(async (path: string, body: unknown): Promise<ApiResponse & { ok: boolean; status: number }> => {
    const started = Date.now();
    try {
      const res = await fetch(`/api/games/${gameId}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as ApiResponse;
      if (json.serverNow) observeServerTime(json.serverNow, started);
      return { ...json, ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, status: 0, error: "NETWORK", message: friendlyError(e) };
    }
  }, [gameId]);

  const move = useCallback(
    async (from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") => {
      const g = gameRef.current;
      if (!g || !derived) return;
      const uci = `${from}${to}${promotion ?? ""}`;
      // Validate locally first for instant feedback.
      const probe = new Chess(derived.chess.fen());
      let san: string;
      try {
        san = probe.move(parseUci(uci)!).san;
      } catch {
        playSound("error");
        return;
      }
      const ply = g.ply;
      setPending({ uci, ply });
      soundPly.current = ply + 1;
      playSound(soundForSan(san));
      const res = await post("move", { uci, ply });
      if (res.ok) {
        accept(res.game);
        return;
      }
      setPending(null);
      if (res.game) accept(res.game);
      else void fetchGame();
      if (res.status !== 409) {
        playSound("error");
        toast("Move not accepted", { body: res.message ?? "Please try again.", tone: "bad" });
      }
    },
    [derived, post, accept, fetchGame],
  );

  const action = useCallback(
    async (name: GameAction, quiet = false) => {
      setBusyAction(name);
      const res = await post("action", { action: name });
      setBusyAction(null);
      if (res.game) accept(res.game);
      if (!res.ok && !quiet) toast("Couldn't do that", { body: res.message ?? "Please try again.", tone: "bad" });
      return res;
    },
    [post, accept],
  );

  const sendChat = useCallback(
    async (body: string) => {
      const text = body.trim().slice(0, 300);
      if (!text) return false;
      const { data, error } = await getSupabase().from("game_messages").insert({ game_id: gameId, body: text }).select("*").single();
      if (error) {
        toast("Message not sent", { body: friendlyError(error), tone: "bad" });
        return false;
      }
      setMessages((ms) => (ms.some((x) => x.id === data.id) ? ms : [...ms, data as ChatMessage]));
      return true;
    },
    [gameId],
  );

  // Auto-claim a fallen flag (the server verifies it).
  useEffect(() => {
    if (!game || game.status !== "active" || game.initial_ms == null || !myColor) return;
    const t = setInterval(() => {
      const g = gameRef.current;
      if (!g || g.status !== "active") return;
      const c = remainingClocks(g, serverNow());
      const mover = sideToMove(g);
      const left = mover === "white" ? c.white : c.black;
      if (left != null && left <= 0 && flagRequested.current !== g.version) {
        flagRequested.current = g.version;
        void action("flag", true);
      }
    }, 250);
    return () => clearInterval(t);
  }, [game, myColor, action]);

  const track = useMemo(() => (game && derived ? trackPieces(game.initial_fen, derived.verbose) : null), [game, derived]);
  const canClaimDraw = Boolean(game && game.status === "active" && derived && !pending && claimableDraw(derived));

  return {
    game,
    load,
    players,
    myColor,
    opponentColor: myColor ? opposite(myColor) : null,
    derived,
    track,
    legal,
    pending,
    live,
    messages,
    busyAction,
    canClaimDraw,
    move,
    action,
    sendChat,
    refetch: fetchGame,
  };
}
