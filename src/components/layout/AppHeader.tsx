"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Crown, LayoutDashboard, LogOut, Moon, Settings, Swords, User, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePresence } from "@/lib/realtime/presence";
import { useChallenges } from "@/lib/realtime/challenges";
import { Avatar } from "@/components/ui/Avatar";
import { Logo } from "./Logo";
import { STATUS_LABEL, StatusDot } from "./StatusDot";

const NAV = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/lobby", label: "Play", icon: Swords },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppHeader({ compact = false }: { compact?: boolean }) {
  const { profile, userId, signOut } = useAuth();
  const { myStatus, connected, manualAway, setManualAway, activeGameId } = usePresence();
  const { incoming } = useChallenges();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);

  const hrefFor = (href: string) => (href === "/profile" && profile ? `/profile/${profile.username}` : href);
  const isActive = (href: string) =>
    href === "/profile" ? Boolean(profile && path === `/profile/${profile.username}`) : path === href || path.startsWith(href + "/");

  return (
    <>
      <header className={clsx("sticky top-0 z-40 border-b border-line bg-[rgba(11,11,13,0.78)] backdrop-blur-xl", compact && "lg:static")}>
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:h-16 sm:px-6">
          <Logo href={userId ? "/dashboard" : "/"} />
          {userId && (
            <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={hrefFor(n.href)}
                  className={clsx(
                    "relative rounded-[10px] px-3 py-2 text-[14px] font-medium transition-colors",
                    isActive(n.href) ? "text-text" : "text-muted hover:text-text",
                  )}
                >
                  {n.label}
                  {n.href === "/lobby" && incoming.length > 0 && (
                    <span className="absolute -right-0.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">{incoming.length}</span>
                  )}
                  {isActive(n.href) && <span className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-accent sm:-bottom-[17px]" />}
                </Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            {userId && activeGameId && !path.startsWith(`/game/${activeGameId}`) && (
              <Link
                href={`/game/${activeGameId}`}
                className="hidden items-center gap-2 rounded-full bg-accent/12 px-3 py-1.5 text-[13px] font-medium text-accent-2 ring-1 ring-inset ring-accent/30 transition hover:bg-accent/20 sm:flex"
              >
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
                Back to your game
              </Link>
            )}
            {userId ? (
              <div className="relative" ref={menuRef}>
                <button
                  className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 ring-1 ring-inset ring-line transition hover:bg-white/[0.04]"
                  onClick={() => setOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  data-testid="user-menu"
                >
                  <Avatar user={profile} size="sm" status={<StatusDot status={myStatus} />} />
                  <span className="hidden max-w-[140px] truncate text-[14px] font-medium sm:block">{profile?.display_name ?? "…"}</span>
                </button>
                {open && (
                  <div className="card absolute right-0 top-[calc(100%+8px)] w-64 animate-rise p-1.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]" role="menu">
                    <div className="px-3 py-2.5">
                      <p className="truncate text-[14px] font-medium text-text">{profile?.display_name}</p>
                      <p className="truncate text-[13px] text-faint">@{profile?.username}</p>
                      <div className="mt-2 flex items-center gap-2 text-[12px] text-muted">
                        <StatusDot status={myStatus} ring={false} />
                        {STATUS_LABEL[myStatus]}
                        <span className="ml-auto flex items-center gap-1 text-faint" title={connected ? "Connected to the live server" : "Reconnecting…"}>
                          {connected ? <Wifi className="h-3.5 w-3.5 text-ok" /> : <WifiOff className="h-3.5 w-3.5 text-bad" />}
                          {connected ? "Live" : "Offline"}
                        </span>
                      </div>
                    </div>
                    <div className="my-1 h-px bg-line" />
                    <button className="menu-item flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[14px] text-muted hover:bg-white/[0.05] hover:text-text" onClick={() => setManualAway(!manualAway)} role="menuitem">
                      <Moon className="h-4 w-4" /> {manualAway ? "Set as available" : "Appear away"}
                    </button>
                    {profile && (
                      <Link className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[14px] text-muted hover:bg-white/[0.05] hover:text-text" href={`/profile/${profile.username}`} onClick={() => setOpen(false)} role="menuitem">
                        <Crown className="h-4 w-4" /> Your profile
                      </Link>
                    )}
                    <Link className="flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[14px] text-muted hover:bg-white/[0.05] hover:text-text" href="/settings" onClick={() => setOpen(false)} role="menuitem">
                      <Settings className="h-4 w-4" /> Settings
                    </Link>
                    <button className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[14px] text-muted hover:bg-white/[0.05] hover:text-text" onClick={() => void signOut()} role="menuitem" data-testid="sign-out">
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/login" className="rounded-[10px] px-3 py-2 text-[14px] font-medium text-muted hover:text-text">
                  Sign in
                </Link>
                <Link href="/register" className="rounded-[12px] bg-[linear-gradient(180deg,var(--accent-2),var(--accent))] px-4 py-2 text-[14px] font-semibold text-accent-ink">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {userId && <MobileNav hrefFor={hrefFor} isActive={isActive} badge={incoming.length} hidden={path.startsWith("/game/")} />}
    </>
  );
}

function MobileNav({ hrefFor, isActive, badge, hidden }: { hrefFor: (h: string) => string; isActive: (h: string) => boolean; badge: number; hidden: boolean }) {
  if (hidden) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[rgba(14,14,17,0.92)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Main">
      <div className="grid grid-cols-4">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <Link key={n.href} href={hrefFor(n.href)} className={clsx("relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", isActive(n.href) ? "text-accent-2" : "text-faint")}>
              <Icon className="h-5 w-5" />
              {n.label}
              {n.href === "/lobby" && badge > 0 && <span className="absolute right-[28%] top-1.5 h-2 w-2 rounded-full bg-accent" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
