"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Search, Swords, Users } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePresence, type PresenceStatus } from "@/lib/realtime/presence";
import { useChallenges } from "@/lib/realtime/challenges";
import { PUBLIC_PROFILE_COLUMNS, type PublicProfile } from "@/lib/chess/types";
import { Avatar } from "@/components/ui/Avatar";
import { Button, EmptyState, Input, Segmented, Skeleton } from "@/components/ui";
import { STATUS_LABEL, StatusDot } from "@/components/layout/StatusDot";
import { ChallengeDialog } from "./ChallengeDialog";

const ORDER: Record<PresenceStatus, number> = { available: 0, playing: 1, away: 2, offline: 3 };

export function PlayerList() {
  const { userId } = useAuth();
  const { online, statusOf } = usePresence();
  const { outgoing, incoming } = useChallenges();
  const [filter, setFilter] = useState<"online" | "all">("online");
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PublicProfile[] | null>(null);
  const [target, setTarget] = useState<PublicProfile | null>(null);

  // Registered players (server-side search when a query is typed).
  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    const t = setTimeout(
      async () => {
        let req = getSupabase().from("profiles").select(PUBLIC_PROFILE_COLUMNS);
        if (userId) req = req.neq("id", userId);
        const safe = q.replace(/[^A-Za-z0-9_ .-]/g, "");
        if (safe) req = req.or(`username.ilike.*${safe}*,display_name.ilike.*${safe}*`);
        const { data } = await req.order("rating", { ascending: false }).limit(q ? 50 : 300);
        if (!cancelled) setPlayers((data as PublicProfile[] | null) ?? []);
      },
      q ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, userId]);

  const rows = useMemo(() => {
    const byId = new Map<string, PublicProfile>();
    for (const p of players ?? []) byId.set(p.id, p);
    // Anyone online who wasn't in the first page of results.
    const q = query.trim().toLowerCase();
    for (const m of online.values()) {
      if (m.user_id === userId || byId.has(m.user_id)) continue;
      if (q && !m.username.toLowerCase().includes(q) && !m.display_name.toLowerCase().includes(q)) continue;
      byId.set(m.user_id, { id: m.user_id, username: m.username, display_name: m.display_name, avatar_url: m.avatar_url, avatar_preset: m.avatar_preset, rating: m.rating });
    }
    return [...byId.values()]
      .map((p) => ({ p, status: statusOf(p.id) }))
      .filter((r) => filter === "all" || r.status !== "offline")
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.p.rating - a.p.rating || a.p.username.localeCompare(b.p.username));
  }, [players, online, statusOf, filter, query, userId]);

  const onlineCount = [...online.keys()].filter((k) => k !== userId).length;

  return (
    <div className="card overflow-hidden" data-testid="player-list">
      <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players by username" className="pl-10" aria-label="Search players" data-testid="player-search" />
        </div>
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "online", label: `Online · ${onlineCount}` },
            { value: "all", label: "Everyone" },
          ]}
        />
      </div>

      {players === null ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title={query ? "No players match that search" : filter === "online" ? "Nobody else is online right now" : "No other players yet"}
          body={filter === "online" && !query ? "Share the site with a friend — they'll appear here the moment they sign in." : undefined}
          action={filter === "online" && !query ? <Button size="sm" variant="subtle" onClick={() => setFilter("all")}>Show everyone</Button> : undefined}
        />
      ) : (
        <ul className="scroll-thin max-h-[640px] divide-y divide-line overflow-y-auto">
          {rows.map(({ p, status }) => {
            const pendingOut = outgoing.some((c) => c.to_id === p.id);
            const pendingIn = incoming.some((c) => c.from_id === p.id);
            const canChallenge = status === "available" || status === "away";
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]" data-testid="player-row" data-username={p.username} data-status={status}>
                <Link href={`/profile/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar user={p} size="md" status={<StatusDot status={status} />} />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-text">{p.display_name}</span>
                    <span className="block truncate text-[12px] text-faint">
                      @{p.username} · <span className="tabular">{p.rating}</span>
                    </span>
                  </span>
                </Link>
                <span className={clsx("hidden w-20 text-right text-[12px] sm:block", status === "available" ? "text-ok" : status === "playing" ? "text-accent-2" : status === "away" ? "text-away" : "text-faint")}>
                  {STATUS_LABEL[status]}
                </span>
                {pendingIn ? (
                  <span className="w-[112px] text-center text-[12px] text-accent-2">Challenged you</span>
                ) : pendingOut ? (
                  <span className="w-[112px] text-center text-[12px] text-muted">Waiting…</span>
                ) : (
                  <Button
                    size="sm"
                    variant={status === "available" ? "primary" : "subtle"}
                    className="w-[112px]"
                    icon={<Swords className="h-3.5 w-3.5" />}
                    disabled={!canChallenge}
                    title={canChallenge ? undefined : status === "playing" ? "In a game right now" : "Offline"}
                    onClick={() => setTarget(p)}
                    data-testid="challenge-button"
                  >
                    Challenge
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ChallengeDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}
