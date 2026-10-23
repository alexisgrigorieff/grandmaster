"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";

export function LandingCta() {
  const { userId } = useAuth();
  return (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {userId ? (
        <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,var(--accent-2),var(--accent))] px-6 py-3.5 text-[15px] font-semibold text-accent-ink shadow-[0_10px_40px_-10px_rgba(214,170,92,0.6)] transition hover:brightness-105">
          Go to your dashboard <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <>
          <Link href="/register" className="inline-flex items-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,var(--accent-2),var(--accent))] px-6 py-3.5 text-[15px] font-semibold text-accent-ink shadow-[0_10px_40px_-10px_rgba(214,170,92,0.6)] transition hover:brightness-105">
            Start playing — it&apos;s free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/login" className="rounded-[14px] px-5 py-3.5 text-[15px] font-medium text-muted ring-1 ring-inset ring-line-2 transition hover:bg-white/[0.04] hover:text-text">
            I have an account
          </Link>
        </>
      )}
    </div>
  );
}
