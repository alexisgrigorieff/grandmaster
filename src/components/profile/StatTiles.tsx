export interface Stats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
}

export function StatTiles({ stats, rating }: { stats: Stats | null; rating: number | null }) {
  const pct = stats && stats.games ? Math.round((stats.wins / stats.games) * 100) : null;
  const tiles = [
    { label: "Rating", value: rating ?? "—", accent: true },
    { label: "Games", value: stats?.games ?? "—" },
    { label: "Wins", value: stats?.wins ?? "—" },
    { label: "Losses", value: stats?.losses ?? "—" },
    { label: "Draws", value: stats?.draws ?? "—" },
    { label: "Win rate", value: pct == null ? "—" : `${pct}%` },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-6" data-testid="stats">
      {tiles.map((t) => (
        <div key={t.label} className="card px-4 py-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">{t.label}</p>
          <p className={`tabular mt-1 text-[24px] font-semibold leading-none ${t.accent ? "text-accent-2" : "text-text"}`} data-stat={t.label}>
            {t.value}
          </p>
        </div>
      ))}
      {stats && stats.games > 0 && (
        <div className="col-span-3 sm:col-span-6">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.05]" aria-hidden>
            <div className="bg-ok" style={{ width: `${(stats.wins / stats.games) * 100}%` }} />
            <div className="bg-[#77737b]" style={{ width: `${(stats.draws / stats.games) * 100}%` }} />
            <div className="bg-bad" style={{ width: `${(stats.losses / stats.games) * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
