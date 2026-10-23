"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type BoardMode = "3d" | "2d";
export type PieceStyle = "wood" | "modern";
export type Quality = "low" | "medium" | "high";
export type AnimationSpeed = "off" | "fast" | "normal" | "slow";

export interface Settings {
  boardMode: BoardMode;
  pieceStyle: PieceStyle;
  quality: Quality;
  sound: boolean;
  volume: number;
  showLegalMoves: boolean;
  showCoordinates: boolean;
  animationSpeed: AnimationSpeed;
  autoQueen: boolean;
  dragToMove: boolean;
  chat: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  boardMode: "3d",
  pieceStyle: "wood",
  quality: "medium",
  sound: true,
  volume: 0.7,
  showLegalMoves: true,
  showCoordinates: true,
  animationSpeed: "normal",
  autoQueen: false,
  dragToMove: true,
  chat: true,
};

interface SettingsStore extends Settings {
  hydratedFromProfile: boolean;
  set: (patch: Partial<Settings>) => void;
  replace: (s: Partial<Settings>) => void;
}

/** Sanitise settings coming from storage or the profile. */
export function sanitizeSettings(input: unknown): Partial<Settings> {
  if (!input || typeof input !== "object") return {};
  const src = input as Record<string, unknown>;
  const out: Partial<Settings> = {};
  const pick = <K extends keyof Settings>(k: K, ok: (v: unknown) => boolean) => {
    if (k in src && ok(src[k])) out[k] = src[k] as Settings[K];
  };
  pick("boardMode", (v) => v === "3d" || v === "2d");
  pick("pieceStyle", (v) => v === "wood" || v === "modern");
  pick("quality", (v) => v === "low" || v === "medium" || v === "high");
  pick("animationSpeed", (v) => ["off", "fast", "normal", "slow"].includes(v as string));
  pick("volume", (v) => typeof v === "number" && v >= 0 && v <= 1);
  for (const k of ["sound", "showLegalMoves", "showCoordinates", "autoQueen", "dragToMove", "chat"] as const) {
    pick(k, (v) => typeof v === "boolean");
  }
  return out;
}

function safeStorage() {
  return createJSONStorage(() => {
    try {
      const k = "__gm_probe";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch {
      const mem = new Map<string, string>();
      return {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => void mem.set(k, v),
        removeItem: (k: string) => void mem.delete(k),
      };
    }
  });
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      hydratedFromProfile: false,
      set: (patch) => set(sanitizeSettings(patch)),
      replace: (s) => set({ ...sanitizeSettings(s), hydratedFromProfile: true }),
    }),
    {
      name: "grandmaster-settings",
      version: 1,
      storage: safeStorage(),
      partialize: (s) => {
        const { set: _s, replace: _r, hydratedFromProfile: _h, ...rest } = s;
        return rest;
      },
    },
  ),
);

export function settingsSnapshot(s: Settings): Settings {
  const out = {} as Settings;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) (out as unknown as Record<string, unknown>)[k] = s[k];
  return out;
}

export function animationMs(speed: AnimationSpeed): number {
  return { off: 0, fast: 160, normal: 280, slow: 450 }[speed];
}
