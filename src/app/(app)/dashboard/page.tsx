"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Swords, Users } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePresence } from "@/lib/realtime/presence";
import { replay } from "@/lib/chess/rules";
import { trackPieces } from "@/lib/chess/pieces";
import { sideToMove } from "@/lib/chess/clock";
import { formatTimeControl } from "@/lib/chess/constants";
import { PUBLIC_PROFILE_COLUMNS, type GameRow, type PublicProfile } from "@/lib/chess/types";
import { Page } from "@/components/layout/Page";
import { QuickPlay } from "@/components/lobby/QuickPlay";
import { StatTiles, type Stats } from "@/components/profile/StatTiles";
import { GameHistory, type HistoryRow } from "@/components/profile/GameHistory";
import { Avatar } from "@/components/ui/Avatar";
import { Button, SectionTitle, Skeleton } from "@/components/ui";
import { StatusDot } from "@/components/layout/StatusDot";
import Board2D from "@/components/board2d/Board2D";

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function CurrentGame({ gameId, me }: { gameId: string; me: string }) {
  const [game, setGame] = useState<GameRow | null>(null);
  const [opp, setOpp] = useState<PublicProfile | null>(null);
  useEffect(() => {
    void getSupabase()
      .from("games")
      .select("*")
      .eq("id", gameId)
      .maybeSingle()
      .then(async ({ data }) => {
        const g = data as GameRow | null;
        setGame(g);
        if (g) {
          const oid = g.white_id === me ? g.black_id : g.white_id;
          const { data: p } = await getSupabase().from("profiles").select(PUBLIC_PROFILE_COLUMNS).eq("id", oid).maybeSingle();
          setOpp(p as PublicProfile | null);
        }
      });
  }, [gameId, me]);
  const pieces = useMemo(() => (game ? trackPieces(game.initial_fen, replay(game.initial_fen, game.moves).verbose).pieces : []), [game]);
  if (!game) return <Skeleton className="h-40" />;
  const myColor = game.white_id === me ? "white" : "black";
  const myTurn = sideToMove(game) === myColor;
  return (
    <Link href={`/game/${gameId}`} className="card group flex items-center gap-5 p-4 transition hover:border-accent/40" data-testid="current-game">
      <div className="pointer-events-none w-28 shrink-0 sm:w-36">
        <Board2D pieces={pieces} orientation={myColor} legal={new Map()} lastMove={null} check={null} interactive={false} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent">Game in progress</p>
        <p className="mt-1.5 flex items-center gap-2 truncate text-[17px] font-medium text-text">
          <Avatar user={opp} size="xs" /> vs {opp?.display_name ?? "…"}
        </p>
        <p className="mt-1 text-[13px] text-muted">
          {formatTimeControl(game.initial_ms, game.increment_ms)} · move {Math.floor(game.ply / 2) + 1} · {myTurn ? <span className="text-accent-2">your turn</span> : "their turn"}
        </p>
        <span className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent-2">
          Continue <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const { profile, userId } = useAuth();
  const { activeGameId, online, myStatus } = usePresence();
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    if (!userId) return;
    const sb = getSupabase();
    void sb.rpc("profile_stats", { p_user: userId }).then(({ data }) => setStats((data as Stats) ?? null));
    void sb.rpc("profile_games", { p_user: userId, p_limit: 8 }).then(({ data }) => setHistory((data as HistoryRow[]) ?? []));
  }, [userId, activeGameId]);

  const others = [...online.values()].filter((m) => m.user_id !== userId).slice(0, 6);

  return (
    <Page width="wide">
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar user={profile} size="xl" className="hidden sm:inline-flex" />
        <div className="flex-1">
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <StatusDot status={myStatus} ring={false} /> {greeting()}
          </p>
          <h1 className="font-display mt-1 text-[34px] leading-tight text-text sm:text-[42px]" data-testid="dashboard-name">
            {profile?.display_name ?? <span className="inline-block h-9 w-56 animate-pulse rounded bg-white/5" />}
          </h1>
          {profile && <p className="mt-1 text-[14px] text-faint">@{profile.username}</p>}
        </div>
        <Link href="/lobby">
          <Button variant="primary" size="lg" icon={<Swords className="h-5 w-5" />} data-testid="play-button">
            Play
          </Button>
        </Link>
      </div>

      <StatTiles stats={stats} rating={profile?.rating ?? null} />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-6">
          {activeGameId && userId && (
            <section>
              <SectionTitle>Current game</SectionTitle>
              <CurrentGame gameId={activeGameId} me={userId} />
            </section>
          )}
          <section className="card overflow-hidden">
            <div className="px-4 pt-4">
              <SectionTitle action={profile && <Link href={`/profile/${profile.username}`} className="text-[13px] text-muted hover:text-text">View all</Link>}>Recent games</SectionTitle>
            </div>
            <GameHistory rows={history} canOpen emptyBody="Your finished games will show up here. Each one can be replayed move by move." />
          </section>
        </div>
        <div className="space-y-6">
          {!activeGameId && (
            <section className="card p-5">
              <SectionTitle>Quick play</SectionTitle>
              <QuickPlay compact />
            </section>
          )}
          <section className="card p-5">
            <SectionTitle action={<Link href="/lobby" className="text-[13px] text-muted hover:text-text">Lobby</Link>}>Online now</SectionTitle>
            {others.length === 0 ? (
              <div className="flex items-center gap-3 rounded-[12px] bg-white/[0.02] p-3 text-[13px] text-faint">
                <Users className="h-5 w-5" /> Nobody else is online. Send a friend the link!
              </div>
            ) : (
              <ul className="space-y-1">
                {others.map((m) => (
                  <li key={m.user_id}>
                    <Link href={`/profile/${m.username}`} className="flex items-center gap-3 rounded-[12px] px-2 py-2 hover:bg-white/[0.03]">
                      <Avatar user={m} size="sm" status={<StatusDot status={m.status} />} />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-text">{m.display_name}</span>
                      <span className="tabular text-[12px] text-faint">{m.rating}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Page>
  );
}
