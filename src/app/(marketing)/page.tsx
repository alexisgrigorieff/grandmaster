import Link from "next/link";
import { Clock, Eye, Globe2, History, ShieldCheck, Users } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { ShowcaseBoard } from "@/components/landing/ShowcaseBoard";
import { SetupNotice } from "@/components/layout/SetupNotice";
import { LogoMark } from "@/components/layout/Logo";
import { LandingCta } from "@/components/landing/LandingCta";

const FEATURES = [
  { icon: Users, title: "A live lobby", body: "See who's online, available or mid-game the moment it happens — presence comes from real connections, not last login." },
  { icon: Globe2, title: "Real-time play", body: "Moves land on both screens in a blink. Refresh, lose Wi-Fi, switch devices — your game is right where you left it." },
  { icon: ShieldCheck, title: "Every rule, enforced", body: "Castling, en passant, promotion, repetition and the 50/75-move rules — all validated on the server, never trusted from the browser." },
  { icon: Clock, title: "Fair clocks", body: "Bullet to classical with increments. Server-authoritative timing, so a slow connection can't steal or gift seconds." },
  { icon: Eye, title: "3D or 2D", body: "A crafted wooden or modern set you can orbit and zoom — or a crisp flat board for focus and older devices." },
  { icon: History, title: "History & ratings", body: "Every game is saved as PGN. Replay them move by move, and watch your Elo rating climb." },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main>
        <section className="relative mx-auto grid max-w-[1400px] items-center gap-6 px-4 pb-10 pt-8 sm:px-6 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:pt-0">
          <div className="relative z-10 max-w-xl animate-rise">
            <SetupNotice />
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1 text-[12px] font-medium text-muted ring-1 ring-line">
              <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Free, open-source multiplayer chess
            </p>
            <h1 className="font-display text-[46px] leading-[1.02] text-text sm:text-[64px] lg:text-[72px]">
              Chess, played <em className="font-display italic text-accent-2">beautifully</em>.
            </h1>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted">
              Challenge friends to real-time games on a hand-crafted 3D board. A live lobby, fair clocks and every rule of the game — in your browser, on any device.
            </p>
            <LandingCta />
          </div>
          <div className="relative h-[52vh] min-h-[340px] lg:h-[82vh]">
            <div className="pointer-events-none absolute inset-0 -z-0 rounded-full bg-[radial-gradient(closest-side,rgba(214,170,92,0.12),transparent)]" />
            <ShowcaseBoard />
            <p className="absolute bottom-2 right-3 text-[11px] text-faint">Morphy&apos;s Opera Game, Paris 1858</p>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="font-display max-w-2xl text-[34px] leading-tight text-text sm:text-[44px]">Everything a serious game needs. Nothing it doesn&apos;t.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent/10 text-accent-2 ring-1 ring-inset ring-accent/20">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-[17px] font-semibold text-text">{title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
          <div className="card relative overflow-hidden p-8 text-center sm:p-12">
            <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-[70%] rounded-full bg-[radial-gradient(closest-side,rgba(214,170,92,0.18),transparent)]" />
            <h2 className="font-display relative text-[32px] text-text sm:text-[40px]">Your move.</h2>
            <p className="relative mx-auto mt-2 max-w-md text-[15px] text-muted">Create a free account, send a friend the link, and start your first game in under a minute.</p>
            <div className="relative mt-6 flex justify-center">
              <Link href="/register" className="rounded-[14px] bg-[linear-gradient(180deg,var(--accent-2),var(--accent))] px-6 py-3 text-[15px] font-semibold text-accent-ink shadow-[0_10px_40px_-10px_rgba(214,170,92,0.6)]">
                Create your account
              </Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-[13px] text-faint sm:flex-row">
          <span className="flex items-center gap-2">
            <LogoMark className="h-5 w-5" /> Grandmaster
          </span>
          <span>Built with Next.js, Three.js, chess.js and Supabase.</span>
        </div>
      </footer>
    </div>
  );
}
