"use client";

import clsx from "clsx";
import { create } from "zustand";
import type { ReactNode } from "react";

export interface Toast {
  id: number;
  title: string;
  body?: ReactNode;
  tone?: "neutral" | "ok" | "bad" | "accent";
  duration?: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
}

let seq = 1;
export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = seq++;
    set({ toasts: [...get().toasts.slice(-3), { id, ...t }] });
    const d = t.duration ?? 4200;
    if (d > 0) setTimeout(() => get().dismiss(id), d);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (title: string, opts: Omit<Toast, "id" | "title"> = {}) => useToasts.getState().push({ title, ...opts });

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex flex-col items-center gap-2 px-3 sm:bottom-5 sm:left-auto sm:right-5 sm:top-auto sm:items-end" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => dismiss(t.id)}
          className={clsx(
            "card pointer-events-auto w-full max-w-sm animate-rise cursor-pointer px-4 py-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]",
            t.tone === "bad" && "border-bad/40",
            t.tone === "ok" && "border-ok/40",
            t.tone === "accent" && "border-accent/40",
          )}
        >
          <p className="text-[14px] font-medium text-text">{t.title}</p>
          {t.body && <div className="mt-0.5 text-[13px] text-muted">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}
