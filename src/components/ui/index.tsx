"use client";

import clsx from "clsx";
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------
type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[linear-gradient(180deg,var(--accent-2),var(--accent))] text-accent-ink shadow-[0_8px_30px_-10px_rgba(214,170,92,0.55),inset_0_1px_0_rgba(255,255,255,0.35)] hover:brightness-[1.06] active:brightness-95",
  secondary: "bg-surface-3 text-text ring-1 ring-inset ring-line-2 hover:bg-[#2a2a32]",
  ghost: "text-muted hover:text-text hover:bg-white/[0.05]",
  danger: "bg-bad/15 text-[#f3a397] ring-1 ring-inset ring-bad/30 hover:bg-bad/25",
  subtle: "bg-white/[0.04] text-text ring-1 ring-inset ring-line hover:bg-white/[0.07]",
};
const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-[10px] gap-1.5",
  md: "h-10 px-4 text-sm rounded-[12px] gap-2",
  lg: "h-12 px-6 text-[15px] rounded-[14px] gap-2.5",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-[background,filter,color,opacity,transform] duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx("inline-block animate-spin rounded-full border-2 border-current border-t-transparent opacity-80", className ?? "h-5 w-5")} aria-hidden />;
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={clsx(
        "h-11 w-full rounded-[12px] bg-bg-2 px-3.5 text-[15px] text-text placeholder:text-faint ring-1 ring-inset transition-shadow focus:outline-none focus:ring-2",
        invalid ? "ring-bad/60 focus:ring-bad" : "ring-line-2 focus:ring-accent/70",
        className,
      )}
      {...rest}
    />
  );
});

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? <p className="text-[13px] text-bad">{error}</p> : hint ? <p className="text-[12px] text-faint">{hint}</p> : null}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 py-3" htmlFor={id}>
      <span>
        <span className="block text-[15px] text-text">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-faint">{description}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx("relative h-6 w-11 shrink-0 rounded-full transition-colors", checked ? "bg-accent" : "bg-surface-3 ring-1 ring-inset ring-line-2")}
      >
        <span className={clsx("absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={clsx("inline-flex rounded-[12px] bg-bg-2 p-1 ring-1 ring-inset ring-line", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            "flex-1 whitespace-nowrap rounded-[9px] font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-[12px]" : "px-3.5 py-1.5 text-[13px]",
            value === o.value ? "bg-surface-3 text-text shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_4px_14px_-6px_rgba(0,0,0,0.6)]" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>("[data-autofocus], button, input")?.focus(), 30);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    window.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", key);
      prev?.focus?.();
    };
  }, [open, onClose, dismissible]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-[3px]" onClick={() => dismissible && onClose()} />
      <div
        ref={ref}
        className={clsx(
          "card relative w-full animate-rise p-5 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] sm:p-6",
          size === "sm" ? "max-w-sm" : size === "md" ? "max-w-md" : "max-w-xl",
        )}
      >
        {title && <h2 className="font-display mb-3 text-xl text-text">{title}</h2>}
        <div className="text-[15px] text-muted">{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-[10px] bg-white/[0.05]", className)} />;
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <p className="text-[15px] font-medium text-text">{title}</p>
      {body && <p className="mt-1 max-w-sm text-[13px] text-faint">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "accent" | "ok" | "bad" | "warn"; className?: string }) {
  const tones = {
    neutral: "bg-white/[0.06] text-muted ring-line",
    accent: "bg-accent/12 text-accent-2 ring-accent/25",
    ok: "bg-ok/12 text-ok ring-ok/25",
    bad: "bg-bad/12 text-[#f3a397] ring-bad/25",
    warn: "bg-warn/12 text-warn ring-warn/25",
  };
  return <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", tones[tone], className)}>{children}</span>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-faint">{children}</h2>
      {action}
    </div>
  );
}
