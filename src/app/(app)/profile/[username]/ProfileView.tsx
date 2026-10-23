"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CalendarDays, Settings, Swords } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePresence } from "@/lib/realtime/presence";
import type { Profile } from "@/lib/chess/types";
import { Page } from "@/components/layout/Page";
import { Avatar } from "@/components/ui/Avatar";
import { Button, SectionTitle, Spinner } from "@/components/ui";
import { STATUS_LABEL, StatusDot } from "@/components/layout/StatusDot";
import { StatTiles, type Stats } from "@/components/profile/StatTiles";
import { GameHistory, type HistoryRow } from "@/components/profile/GameHistory";
import { ChallengeDialog } from "@/components/lobby/ChallengeDialog";

export function ProfileView({ username }: { username: string }) {
  const { userId } = useAuth();
  const { statusOf } = usePresence();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [more, setMore] = useState(true);
  const [challenge, setChallenge] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    void sb
      .from("profiles")
      .select("id, username, display_name, avatar_url, avatar_preset, bio, rating, rated_games, created_at")
      .eq("username", username)
      .maybeSingle()
      .then(async ({ data }) => {
        const p = (data as Profile | null) ?? null;
        setProfile(p);
        if (!p) return;
        const [s, h] = await Promise.all([sb.rpc("profile_stats", { p_user: p.id }), sb.rpc("profile_games", { p_user: p.id, p_limit: 20 })]);
        setStats((s.data as Stats) ?? null);
        const rows = (h.data as HistoryRow[]) ?? [];
        setHistory(rows);
        setMore(rows.length === 20);
      });
  }, [username]);

  async function loadMore() {
    if (!profile || !history?.length) return;
    const { data } = await getSupabase().rpc("profile_games", { p_user: profile.id, p_limit: 20, p_before: history[history.length - 1].finished_at });
    const rows = (data as HistoryRow[]) ?? [];
    setHistory([...history, ...rows]);
    setMore(rows.length === 20);
  }

  if (profile === undefined) {
    return (
      <div className="flex h-[60dvh] items-center justify-center">
        <Spinner className="h-6 w-6 text-faint" />
      </div>
    );
  }
  if (profile === null) {
    return (
      <Page width="narrow" className="text-center">
        <h1 className="font-display mt-16 text-3xl">No such player</h1>
        <p className="mt-2 text-muted">Nobody goes by @{username}.</p>
        <Link href="/lobby" className="mt-6 inline-block">
          <Button variant="primary">Browse players</Button>
        </Link>
      </Page>
    );
  }

  const isMe = profile.id === userId;
  const status = isMe ? statusOf(profile.id) : statusOf(profile.id);
  const canChallenge = Boolean(userId) && !isMe && (status === "available" || status === "away");

  return (
    <Page>
      <div className="card relative mb-6 overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(214,170,92,0.14),transparent)]" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar user={profile} size="xl" status={<StatusDot status={status} className="h-4 w-4" />} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display truncate text-[32px] leading-tight text-text sm:text-[38px]" data-testid="profile-name">
              {profile.display_name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
              <span>@{profile.username}</span>
              <span className="flex items-center gap-1.5">
                <StatusDot status={status} ring={false} /> {STATUS_LABEL[status]}
              </span>
              <span className="flex items-center gap-1.5 text-faint">
                <CalendarDays className="h-3.5 w-3.5" /> Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </span>
            </p>
            {profile.bio && <p className="mt-3 max-w-xl text-[15px] text-text/85">{profile.bio}</p>}
          </div>
          <div className="flex gap-2">
            {isMe ? (
              <Link href="/settings">
                <Button variant="subtle" icon={<Settings className="h-4 w-4" />}>
                  Edit profile
                </Button>
              </Link>
            ) : (
              userId && (
                <Button variant="primary" icon={<Swords className="h-4 w-4" />} disabled={!canChallenge} title={canChallenge ? undefined : "Only available players can be challenged"} onClick={() => setChallenge(true)}>
                  Challenge
                </Button>
              )
            )}
          </div>
        </div>
      </div>

      <StatTiles stats={stats} rating={profile.rating} />

      <section className="card mt-6 overflow-hidden">
        <div className="px-4 pt-4">
          <SectionTitle>Recent games</SectionTitle>
        </div>
        <GameHistory rows={history} canOpen={isMe} emptyBody={isMe ? "Play your first game from the lobby." : undefined} />
        {!isMe && history && history.length > 0 && <p className="border-t border-line px-4 py-2.5 text-[12px] text-faint">Game moves are private to the two players.</p>}
        {more && history && history.length > 0 && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="ghost" size="sm" onClick={loadMore}>
              Load more
            </Button>
          </div>
        )}
      </section>

      <ChallengeDialog target={challenge ? profile : null} onClose={() => setChallenge(false)} />
    </Page>
  );
}
