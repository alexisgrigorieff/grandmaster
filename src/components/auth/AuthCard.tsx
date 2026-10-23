import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="animate-rise">
      <div className="card p-6 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] sm:p-8">
        <h1 className="font-display text-[28px] leading-tight text-text">{title}</h1>
        {subtitle && <p className="mt-1.5 text-[14px] text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-5 text-center text-[14px] text-muted">{footer}</div>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-[12px] border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-[13px] text-[#f3b0a5]">
      {message}
    </div>
  );
}
