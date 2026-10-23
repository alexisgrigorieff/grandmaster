import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";

export type PieceColor = "w" | "b";

/** A piece with a stable identity across moves, so boards can animate it. */
export interface TrackedPiece {
  id: string;
  type: PieceSymbol;
  color: PieceColor;
  square: Square;
}

export interface PieceTrack {
  pieces: TrackedPiece[];
  /** Pieces captured *from* each colour, in capture order. */
  captured: { w: PieceSymbol[]; b: PieceSymbol[] };
}

const FILES = "abcdefgh";

export function squareToCoords(sq: Square): { file: number; rank: number } {
  return { file: FILES.indexOf(sq[0]), rank: Number(sq[1]) - 1 };
}

export function coordsToSquare(file: number, rank: number): Square | null {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return `${FILES[file]}${rank + 1}` as Square;
}

export function isLightSquare(sq: Square): boolean {
  const { file, rank } = squareToCoords(sq);
  return (file + rank) % 2 === 1;
}

/** Initial piece set for a FEN. Ids are deterministic so replays line up. */
export function initialPieces(fen: string): TrackedPiece[] {
  const chess = new Chess(fen);
  const counters: Record<string, number> = {};
  const out: TrackedPiece[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p) continue;
      const k = `${p.color}${p.type}`;
      counters[k] = (counters[k] ?? 0) + 1;
      out.push({ id: `${k}${counters[k]}`, type: p.type, color: p.color, square: p.square });
    }
  }
  return out;
}

/** Follow pieces through a list of verbose moves. */
export function trackPieces(initialFen: string, moves: Move[]): PieceTrack {
  const bySquare = new Map<Square, TrackedPiece>();
  for (const p of initialPieces(initialFen)) bySquare.set(p.square, { ...p });
  const captured: PieceTrack["captured"] = { w: [], b: [] };

  for (const m of moves) {
    const piece = bySquare.get(m.from);
    if (!piece) continue;

    if (m.captured) {
      const capSq = m.flags.includes("e") ? (`${m.to[0]}${m.from[1]}` as Square) : m.to;
      const victim = bySquare.get(capSq);
      if (victim) {
        bySquare.delete(capSq);
        captured[victim.color].push(victim.type);
      }
    }

    bySquare.delete(m.from);
    piece.square = m.to;
    if (m.promotion) piece.type = m.promotion;
    bySquare.set(m.to, piece);

    if (m.flags.includes("k") || m.flags.includes("q")) {
      const rank = m.from[1];
      const [rf, rt] = m.flags.includes("k") ? ["h", "f"] : ["a", "d"];
      const rook = bySquare.get(`${rf}${rank}` as Square);
      if (rook) {
        bySquare.delete(rook.square);
        rook.square = `${rt}${rank}` as Square;
        bySquare.set(rook.square, rook);
      }
    }
  }
  return { pieces: [...bySquare.values()], captured };
}

const VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Material advantage for white (positive) or black (negative). */
export function materialBalance(track: PieceTrack): number {
  const lostByWhite = track.captured.w.reduce((s, t) => s + VALUES[t], 0);
  const lostByBlack = track.captured.b.reduce((s, t) => s + VALUES[t], 0);
  return lostByBlack - lostByWhite;
}

export function sortCaptured(list: PieceSymbol[]): PieceSymbol[] {
  const order: PieceSymbol[] = ["q", "r", "b", "n", "p"];
  return [...list].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
