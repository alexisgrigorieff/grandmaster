"use client";

import { useSettings } from "./settings";

/**
 * Tiny synthesised sound kit (Web Audio) — no audio files to load.
 * A wooden "tock" for moves, a sharper double hit for captures, a soft bell
 * for checks and notifications.
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

/** Call from a user gesture once so mobile browsers allow audio later. */
export function unlockAudio() {
  audio();
}

function enabled(): number {
  const s = useSettings.getState();
  return s.sound ? s.volume : 0;
}

function knock(ac: AudioContext, at: number, gain: number, freq: number, decay: number) {
  // Noise burst through a resonant band-pass: sounds like wood on wood.
  const len = Math.floor(ac.sampleRate * decay);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = 2.2;
  const body = ac.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(freq / 4, at);
  body.frequency.exponentialRampToValueAtTime(freq / 9, at + decay);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  const bg = ac.createGain();
  bg.gain.setValueAtTime(gain * 0.6, at);
  bg.gain.exponentialRampToValueAtTime(0.0001, at + decay * 0.8);
  src.connect(bp).connect(g).connect(ac.destination);
  body.connect(bg).connect(ac.destination);
  src.start(at);
  body.start(at);
  body.stop(at + decay);
}

function bell(ac: AudioContext, at: number, gain: number, freqs: number[], dur = 0.6) {
  for (const [i, f] of freqs.entries()) {
    const o = ac.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ac.createGain();
    const t = at + i * 0.09;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur);
  }
}

export type SoundName = "move" | "capture" | "check" | "castle" | "notify" | "start" | "end" | "lowtime" | "error";

export function playSound(name: SoundName) {
  const vol = enabled();
  if (!vol) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.005;
  switch (name) {
    case "move":
      knock(ac, t, 0.55 * vol, 1700, 0.09);
      break;
    case "capture":
      knock(ac, t, 0.7 * vol, 2100, 0.08);
      knock(ac, t + 0.045, 0.5 * vol, 1300, 0.1);
      break;
    case "castle":
      knock(ac, t, 0.5 * vol, 1600, 0.08);
      knock(ac, t + 0.11, 0.5 * vol, 1500, 0.09);
      break;
    case "check":
      knock(ac, t, 0.55 * vol, 1700, 0.09);
      bell(ac, t + 0.02, 0.08 * vol, [988], 0.35);
      break;
    case "notify":
      bell(ac, t, 0.12 * vol, [784, 1175], 0.5);
      break;
    case "start":
      bell(ac, t, 0.1 * vol, [523, 659, 784], 0.55);
      break;
    case "end":
      bell(ac, t, 0.1 * vol, [784, 659, 523], 0.7);
      break;
    case "lowtime":
      bell(ac, t, 0.06 * vol, [1319], 0.15);
      break;
    case "error":
      bell(ac, t, 0.06 * vol, [220], 0.2);
      break;
  }
}

export function soundForSan(san: string): SoundName {
  if (san.includes("+") || san.includes("#")) return "check";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("x")) return "capture";
  return "move";
}
