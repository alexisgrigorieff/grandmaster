import * as THREE from "three";
import type { PieceStyle, Quality } from "@/lib/settings";

/** Deterministic PRNG so textures look the same on every load. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, THREE.Texture>();

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d")!];
}

function finish(c: HTMLCanvasElement, srgb = true, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

/** Wood grain into a rect: long wavy streaks with ring variation. */
function paintGrain(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  dark: string,
  rand: () => number,
  vertical: boolean,
  strength = 1,
) {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  const lines = Math.floor((vertical ? w : h) / 3);
  const phase = rand() * 100;
  for (let i = 0; i < lines; i++) {
    const t = i / lines;
    const alpha = (0.05 + 0.13 * Math.abs(Math.sin(t * 22 + phase)) * rand()) * strength;
    g.strokeStyle = dark;
    g.globalAlpha = alpha;
    g.lineWidth = 0.6 + rand() * 1.8;
    g.beginPath();
    const steps = 24;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const wave = Math.sin(u * 6 + phase + i * 0.15) * 2.2 + Math.sin(u * 17 + i) * 0.7;
      const px = vertical ? x + t * w + wave : x + u * w;
      const py = vertical ? y + u * h : y + t * h + wave;
      if (s === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  // Subtle pores.
  for (let i = 0; i < (w * h) / 220; i++) {
    g.fillStyle = dark;
    g.globalAlpha = 0.05 * strength;
    g.fillRect(x + rand() * w, y + rand() * h, 1 + rand() * 2, 1);
  }
  g.globalAlpha = 1;
  g.restore();
}

function paintStone(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, fleck: string, rand: () => number) {
  g.fillStyle = base;
  g.fillRect(x, y, w, h);
  for (let i = 0; i < (w * h) / 40; i++) {
    g.globalAlpha = 0.03 + rand() * 0.05;
    g.fillStyle = fleck;
    const r = rand() * 1.6;
    g.fillRect(x + rand() * w, y + rand() * h, r, r);
  }
  // soft veins
  g.globalAlpha = 0.05;
  g.strokeStyle = fleck;
  g.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    let px = x + rand() * w;
    let py = y;
    g.moveTo(px, py);
    while (py < y + h) {
      px += (rand() - 0.5) * 10;
      py += 6 + rand() * 8;
      g.lineTo(px, py);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

export const PALETTE = {
  wood: { light: "#E2C79B", lightGrain: "#9C6E3C", dark: "#6B4226", darkGrain: "#2B160A", frame: "#3A2214", frameGrain: "#120804", coord: "rgba(236, 205, 150, 0.82)" },
  modern: { light: "#D9D6CE", lightGrain: "#9A968C", dark: "#33363C", darkGrain: "#0F1012", frame: "#17181B", frameGrain: "#000000", coord: "rgba(215, 210, 200, 0.7)" },
} as const;

export function boardTexture(style: PieceStyle, quality: Quality): THREE.Texture {
  const key = `board:${style}:${quality}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = quality === "low" ? 512 : quality === "medium" ? 1024 : 2048;
  const [c, g] = canvas(size);
  const sq = size / 8;
  const rand = mulberry32(style === "wood" ? 7 : 11);
  const pal = PALETTE[style];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (f + r) % 2 === 0; // canvas row 0 = rank 8; a8 is light
      const x = f * sq;
      const y = r * sq;
      if (style === "wood") {
        paintGrain(g, x, y, sq, sq, light ? pal.light : pal.dark, light ? pal.lightGrain : pal.darkGrain, rand, (f + r) % 2 === 0, light ? 0.8 : 1.2);
      } else {
        paintStone(g, x, y, sq, sq, light ? pal.light : pal.dark, light ? pal.lightGrain : "#8a8f99", rand);
      }
      // Hairline bevel between squares.
      g.strokeStyle = "rgba(0,0,0,0.16)";
      g.lineWidth = Math.max(1, size / 1024);
      g.strokeRect(x + 0.5, y + 0.5, sq - 1, sq - 1);
    }
  }
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function frameTexture(style: PieceStyle): THREE.Texture {
  const key = `frame:${style}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(512);
  const pal = PALETTE[style];
  const rand = mulberry32(3);
  if (style === "wood") paintGrain(g, 0, 0, 512, 512, pal.frame, pal.frameGrain, rand, false, 1.4);
  else paintStone(g, 0, 0, 512, 512, pal.frame, "#3b3e45", rand);
  const t = finish(c, true, true);
  cache.set(key, t);
  return t;
}

/** Transparent overlay with file/rank labels around the playing area. */
export function coordinatesTexture(style: PieceStyle, inner: number, outer: number): THREE.Texture {
  const key = `coords:${style}:${inner}:${outer}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 1024;
  const [c, g] = canvas(size);
  const px = size / outer; // pixels per world unit
  const border = ((outer - inner) / 2) * px;
  const sq = inner * px / 8;
  g.fillStyle = PALETTE[style].coord;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `600 ${Math.round(border * 0.42)}px Inter, ui-sans-serif, system-ui, sans-serif`;
  const files = "abcdefgh";
  for (let i = 0; i < 8; i++) {
    const cx = border + sq * (i + 0.5);
    // White's edge (bottom of the texture = +z side of the board).
    g.fillText(files[i], cx, size - border / 2);
    // Black's edge, rotated so it reads upright from the other side.
    g.save();
    g.translate(cx, border / 2);
    g.rotate(Math.PI);
    g.fillText(files[i], 0, 0);
    g.restore();
    const cy = border + sq * (7 - i + 0.5);
    g.fillText(String(i + 1), border / 2, cy);
    g.save();
    g.translate(size - border / 2, cy);
    g.rotate(Math.PI);
    g.fillText(String(i + 1), 0, 0);
    g.restore();
  }
  // Thin inlay line around the playing field.
  g.strokeStyle = PALETTE[style].coord;
  g.globalAlpha = 0.35;
  g.lineWidth = 2;
  g.strokeRect(border - 6, border - 6, size - 2 * border + 12, size - 2 * border + 12);
  const t = finish(c);
  cache.set(key, t);
  return t;
}

export function grainTexture(kind: "light" | "dark"): THREE.Texture {
  const key = `grain:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(256);
  const rand = mulberry32(kind === "light" ? 21 : 42);
  if (kind === "light") paintGrain(g, 0, 0, 256, 256, "#E8D2A8", "#A87B47", rand, true, 0.9);
  else paintGrain(g, 0, 0, 256, 256, "#3A2418", "#0C0603", rand, true, 1.3);
  const t = finish(c, true, true);
  t.repeat.set(2, 1);
  cache.set(key, t);
  return t;
}

export function radialTexture(color: string): THREE.Texture {
  const key = `radial:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = canvas(256);
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, color);
  grd.addColorStop(0.45, color.replace(/[\d.]+\)$/, "0.45)"));
  grd.addColorStop(1, color.replace(/[\d.]+\)$/, "0)"));
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = finish(c);
  cache.set(key, t);
  return t;
}
