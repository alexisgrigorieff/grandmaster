import clsx from "clsx";
import type { ReactNode } from "react";

export function Page({ children, className, width = "default" }: { children: ReactNode; className?: string; width?: "default" | "narrow" | "wide" }) {
  return (
    <main
      className={clsx(
        "mx-auto w-full px-4 py-6 sm:px-6 sm:py-10",
        width === "narrow" ? "max-w-3xl" : width === "wide" ? "max-w-[1400px]" : "max-w-6xl",
        className,
      )}
    >
      {children}
    </main>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-accent">{eyebrow}</p>}
        <h1 className="font-display text-[30px] leading-[1.1] text-text sm:text-[38px]">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
