import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PieceSymbol } from "chess.js";
import type { PieceStyle, Quality } from "@/lib/settings";

/**
 * Procedurally modelled Staunton-style pieces. Turned pieces are lathed from
 * 2D profiles; the knight's head is an extruded, bevelled silhouette.
 * Units: one board square = 1.
 */

class Profile {
  pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
  private get last() {
    return this.pts[this.pts.length - 1];
  }
  line(x: number, y: number) {
    this.pts.push(new THREE.Vector2(x, y));
    return this;
  }
  quad(cx: number, cy: number, x: number, y: number, n = 10) {
    const p0 = this.last.clone();
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      this.pts.push(new THREE.Vector2(a * p0.x + b * cx + c * x, a * p0.y + b * cy + c * y));
    }
    return this;
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 14) {
    for (let i = 0; i <= n; i++) {
      const a = THREE.MathUtils.degToRad(a0 + ((a1 - a0) * i) / n);
      this.pts.push(new THREE.Vector2(Math.max(0, cx + r * Math.cos(a)), cy + r * Math.sin(a)));
    }
    return this;
  }
}

/** Shared foot: wide base, a rounded torus ring, then the start of the stem. */
function base(R: number, modern: boolean): Profile {
  const p = new Profile();
  if (modern) {
    p.line(R, 0).line(R, 0.05).quad(R, 0.08, R - 0.03, 0.08, 4).line(R * 0.62, 0.1);
    return p;
  }
  p.line(R, 0)
    .line(R, 0.03)
    .quad(R + 0.004, 0.055, R * 0.93, 0.062, 5)
    .line(R * 0.86, 0.068)
    .arc(R * 0.8, 0.098, 0.03, -90, 90, 10)
    .quad(R * 0.7, 0.13, R * 0.6, 0.15, 6);
  return p;
}

function lathe(p: Profile, segments: number) {
  return new THREE.LatheGeometry(p.pts, segments);
}

function prep(g: THREE.BufferGeometry) {
  const ng = g.index ? g.toNonIndexed() : g;
  if (!ng.getAttribute("uv")) {
    const count = ng.getAttribute("position").count;
    ng.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  for (const name of Object.keys(ng.attributes)) {
    if (!["position", "normal", "uv"].includes(name)) ng.deleteAttribute(name);
  }
  return ng;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map(prep), false)!;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function pawn(seg: number, modern: boolean) {
  if (modern) {
    const p = base(0.24, true).quad(0.1, 0.2, 0.08, 0.32).line(0.08, 0.35);
    return merge([lathe(p.arc(0, 0.45, 0.115, -45, 90), seg)]);
  }
  const p = base(0.25, false)
    .quad(0.1, 0.22, 0.085, 0.31)
    .line(0.15, 0.33)
    .quad(0.168, 0.345, 0.15, 0.362, 5)
    .line(0.082, 0.375)
    .arc(0, 0.468, 0.116, -52, 90, 16);
  return merge([lathe(p, seg)]);
}

function rook(seg: number, modern: boolean) {
  const R = 0.28;
  const p = base(R, modern);
  if (modern) {
    p.line(0.18, 0.12).line(0.17, 0.52).line(0.21, 0.55).line(0.21, 0.66).line(0, 0.66);
    return merge([lathe(p, seg)]);
  }
  p.quad(0.17, 0.22, 0.16, 0.3)
    .line(0.17, 0.49)
    .line(0.215, 0.53)
    .line(0.215, 0.6)
    .line(0.15, 0.6)
    .line(0.15, 0.585)
    .line(0, 0.585);
  const parts: THREE.BufferGeometry[] = [lathe(p, seg)];
  const merlons = 6;
  for (let i = 0; i < merlons; i++) {
    const a = (i / merlons) * Math.PI * 2;
    const b = new THREE.BoxGeometry(0.1, 0.075, 0.065);
    b.translate(0, 0.6 + 0.0375, 0.183);
    b.rotateY(a);
    parts.push(b);
  }
  return merge(parts);
}

function bishop(seg: number, modern: boolean) {
  const p = base(0.27, modern);
  if (modern) {
    p.line(0.15, 0.12).quad(0.09, 0.3, 0.09, 0.4).quad(0.16, 0.55, 0.07, 0.72).line(0, 0.76);
    return merge([lathe(p, seg)]);
  }
  p.quad(0.11, 0.22, 0.095, 0.38)
    .line(0.155, 0.4)
    .quad(0.173, 0.415, 0.155, 0.43, 5)
    .line(0.1, 0.44)
    .line(0.126, 0.455)
    .line(0.088, 0.47)
    .quad(0.19, 0.58, 0.128, 0.705, 12)
    .quad(0.08, 0.77, 0.028, 0.795, 6)
    .arc(0, 0.835, 0.042, -48, 90, 10);
  const parts: THREE.BufferGeometry[] = [lathe(p, seg)];
  return merge(parts);
}

function queen(seg: number, modern: boolean) {
  const p = base(0.3, modern);
  if (modern) {
    p.line(0.17, 0.12).quad(0.09, 0.4, 0.1, 0.5).quad(0.13, 0.7, 0.2, 0.82).line(0.12, 0.84).line(0.06, 0.82).arc(0, 0.86, 0.05, -40, 90);
    return merge([lathe(p, seg)]);
  }
  p.quad(0.12, 0.24, 0.1, 0.43)
    .line(0.172, 0.45)
    .quad(0.19, 0.465, 0.172, 0.48, 5)
    .line(0.11, 0.49)
    .quad(0.12, 0.64, 0.19, 0.765, 12)
    .line(0.165, 0.785)
    .quad(0.09, 0.77, 0.07, 0.81, 6)
    .arc(0, 0.858, 0.048, -55, 90, 10);
  const parts: THREE.BufferGeometry[] = [lathe(p, seg)];
  const points = 9;
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const s = new THREE.SphereGeometry(0.029, 10, 8);
    s.translate(Math.cos(a) * 0.178, 0.792, Math.sin(a) * 0.178);
    parts.push(s);
  }
  return merge(parts);
}

function king(seg: number, modern: boolean) {
  const p = base(0.31, modern);
  if (modern) {
    p.line(0.18, 0.12).quad(0.1, 0.42, 0.11, 0.55).quad(0.13, 0.72, 0.19, 0.86).line(0, 0.88);
    const parts: THREE.BufferGeometry[] = [lathe(p, seg)];
    const v = new THREE.BoxGeometry(0.05, 0.2, 0.05);
    v.translate(0, 0.98, 0);
    const h = new THREE.BoxGeometry(0.15, 0.05, 0.05);
    h.translate(0, 1.0, 0);
    parts.push(v, h);
    return merge(parts);
  }
  p.quad(0.13, 0.24, 0.11, 0.46)
    .line(0.182, 0.48)
    .quad(0.2, 0.495, 0.182, 0.512, 5)
    .line(0.12, 0.522)
    .quad(0.135, 0.68, 0.19, 0.8, 12)
    .line(0.17, 0.83)
    .quad(0.095, 0.845, 0.072, 0.88, 6)
    .line(0.05, 0.895)
    .line(0, 0.895);
  const parts: THREE.BufferGeometry[] = [lathe(p, seg)];
  const v = new THREE.BoxGeometry(0.055, 0.21, 0.055);
  v.translate(0, 0.995, 0);
  const h = new THREE.BoxGeometry(0.165, 0.052, 0.055);
  h.translate(0, 1.015, 0);
  parts.push(v, h);
  return merge(parts);
}

function knight(seg: number, modern: boolean) {
  const p = base(0.28, modern);
  if (modern) p.line(0.18, 0.12).line(0.18, 0.2).line(0, 0.2);
  else p.quad(0.2, 0.17, 0.19, 0.205).line(0.17, 0.22).line(0, 0.22);
  const parts: THREE.BufferGeometry[] = [lathe(p, seg)];

  // Horse head silhouette in the XY plane, +X = the direction the horse faces.
  const s = new THREE.Shape();
  if (modern) {
    s.moveTo(-0.16, 0.18);
    s.lineTo(-0.17, 0.5);
    s.lineTo(-0.06, 0.76);
    s.lineTo(0.02, 0.76);
    s.lineTo(0.22, 0.5);
    s.lineTo(0.2, 0.42);
    s.lineTo(0.04, 0.42);
    s.lineTo(0.12, 0.18);
    s.closePath();
  } else {
    s.moveTo(-0.165, 0.2);
    s.quadraticCurveTo(-0.215, 0.33, -0.19, 0.48);
    s.quadraticCurveTo(-0.175, 0.665, -0.06, 0.745);
    s.lineTo(-0.045, 0.83);
    s.lineTo(-0.005, 0.755);
    s.quadraticCurveTo(0.11, 0.71, 0.2, 0.545);
    s.quadraticCurveTo(0.245, 0.475, 0.205, 0.44);
    s.lineTo(0.12, 0.425);
    s.quadraticCurveTo(0.08, 0.415, 0.055, 0.45);
    s.quadraticCurveTo(0.03, 0.42, 0.0, 0.39);
    s.quadraticCurveTo(-0.03, 0.3, 0.115, 0.2);
    s.closePath();
  }
  const depth = modern ? 0.16 : 0.15;
  const head = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: modern ? 0.02 : 0.04,
    bevelSize: modern ? 0.015 : 0.032,
    bevelSegments: modern ? 2 : 4,
    curveSegments: Math.max(8, Math.round(seg / 3)),
  });
  head.translate(0, 0, -depth / 2);
  parts.push(head);

  if (!modern) {
    // Eyes.
    for (const z of [-1, 1]) {
      const e = new THREE.SphereGeometry(0.022, 8, 6);
      e.translate(0.06, 0.62, z * (depth / 2 + 0.035));
      parts.push(e);
    }
  }
  const g = merge(parts);
  // Face mostly towards the opponent, turned so the silhouette reads from
  // the player's side. Black pieces are rotated 180°.
  g.rotateY(Math.PI / 2 + 1.05);
  return g;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

export function pieceGeometry(type: PieceSymbol, style: PieceStyle, quality: Quality): THREE.BufferGeometry {
  const seg = quality === "low" ? 20 : quality === "medium" ? 36 : 56;
  const key = `${type}:${style}:${seg}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const modern = style === "modern";
  const g = { p: pawn, r: rook, n: knight, b: bishop, q: queen, k: king }[type](seg, modern);
  geoCache.set(key, g);
  return g;
}

export const PIECE_RADIUS: Record<PieceSymbol, number> = { p: 0.25, r: 0.28, n: 0.28, b: 0.27, q: 0.3, k: 0.31 };
