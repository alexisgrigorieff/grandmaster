import Link from "next/link";
import clsx from "clsx";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx("h-7 w-7", className)} aria-hidden>
      <defs>
        <linearGradient id="gm-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F2D49A" />
          <stop offset="1" stopColor="#B9873A" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="#17171b" stroke="rgba(255,255,255,0.08)" />
      <path
        d="M11.2 24.8c-.1-3.7 1.3-5.9 3.5-7.9.9-.8 1-1.8.4-2.4-1.3 1-3.1 1.3-4.5 1.2-1.5-.1-2.5-1.3-2.1-2.8.2-.8 1-1.6 1.8-2.5l2.9-3.2c.6-.6.8-1.4 1-2.2l.3-1.7 1.8 1.8c4.8.4 8.8 4.5 8.7 11-.1 3.5-1 6.8-1.8 8.7Z"
        fill="url(#gm-logo)"
      />
      <rect x="8.5" y="25.6" width="16" height="2.4" rx="1.2" fill="url(#gm-logo)" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={clsx("group flex items-center gap-2.5", className)} aria-label="Grandmaster home">
      <LogoMark />
      <span className="font-display text-[19px] font-medium tracking-tight text-text">Grandmaster</span>
    </Link>
  );
}
