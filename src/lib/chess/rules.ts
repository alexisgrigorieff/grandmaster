import { Chess, type Move, type Square } from "chess.js";
import type { Color, GameResult, MoveRecord, Termination } from "./types";

export type { Move, Square };

const UCI_RE = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;

export function parseUci(uci: string): { from: Square; to: Square; promotion?: "q" | "r" | "b" | "n" } | null {
  const m = UCI_RE.exec(uci);
  if (!m) return null;
  return { from: m[1] as Square, to: m[2] as Square, promotion: m[3] as "q" | "r" | "b" | "n" | undefined };
}

export function moveToUci(m: Pick<Move, "from" | "to" | "promotion">): string {
  return `${m.from}${m.to}${m.promotion ?? ""}`;
}

/**
 * Key used for repetition detection: piece placement, side to move, castling
 * rights and en-passant square. chess.js only writes the en-passant square into
 * the FEN when an en-passant capture is actually legal, which is exactly the
 * FIDE definition of "same position".
 */
export function positionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

export interface Replay {
  chess: Chess;
  /** Position keys after each ply, index 0 = initial position. */
  keys: string[];
  /** Verbose moves, in order. */
  verbose: Move[];
}

/** Rebuild a game from its initial FEN and move list. Throws on corrupt data. */
export function replay(initialFen: string, moves: Pick<MoveRecord, "u">[]): Replay {
  const chess = new Chess(initialFen);
  const keys = [positionKey(chess.fen())];
  const verbose: Move[] = [];
  for (const m of moves) {
    const parsed = parseUci(m.u);
    if (!parsed) throw new Error(`Corrupt move in history: ${m.u}`);
    const mv = chess.move(parsed);
    verbose.push(mv);
    keys.push(positionKey(chess.fen()));
  }
  return { chess, keys, verbose };
}

export function repetitionCount(keys: string[]): number {
  const last = keys[keys.length - 1];
  let n = 0;
  for (const k of keys) if (k === last) n++;
  return n;
}

export function halfmoveClock(fen: string): number {
  return Number(fen.split(" ")[4] ?? 0);
}

export function turnColor(fen: string): Color {
  return fen.split(" ")[1] === "b" ? "black" : "white";
}

export function opposite(c: Color): Color {
  return c === "white" ? "black" : "white";
}

export function winResult(winner: Color): GameResult {
  return winner === "white" ? "1-0" : "0-1";
}

/**
 * Can `color` still deliver checkmate by any sequence of legal moves?
 * Used to decide flag-fall results (FIDE 6.9): if the side whose flag did not
 * fall cannot possibly mate, the game is drawn.
 */
export function canEverMate(chess: Chess, color: Color): boolean {
  const c = color === "white" ? "w" : "b";
  let minors = 0;
  let bishopsLight = 0;
  let bishopsDark = 0;
  let knights = 0;
  let opponentPieces = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (!p || p.type === "k") continue;
      if (p.color !== c) {
        opponentPieces++;
        continue;
      }
      if (p.type === "q" || p.type === "r" || p.type === "p") return true;
      minors++;
      if (p.type === "n") knights++;
      if (p.type === "b") {
        if ((r + f) % 2 === 0) bishopsLight++;
        else bishopsDark++;
      }
    }
  }
  if (minors === 0) return false;
  // Two or more minors can mate (except same-coloured bishops only vs bare king).
  if (minors >= 2) {
    if (knights === 0 && (bishopsLight === 0 || bishopsDark === 0) && opponentPieces === 0) return false;
    return true;
  }
  // A single minor piece can only mate if the opponent has material to block with.
  return opponentPieces > 0;
}

export interface Outcome {
  result: GameResult;
  termination: Termination;
}

/** Automatic game-ending conditions after a move. */
export function automaticOutcome(r: Replay): Outcome | null {
  const { chess, keys } = r;
  if (chess.isCheckmate()) {
    return { result: winResult(opposite(turnColor(chess.fen()))), termination: "checkmate" };
  }
  if (chess.isStalemate()) return { result: "1/2-1/2", termination: "stalemate" };
  if (chess.isInsufficientMaterial()) return { result: "1/2-1/2", termination: "insufficient_material" };
  if (repetitionCount(keys) >= 5) return { result: "1/2-1/2", termination: "fivefold_repetition" };
  if (halfmoveClock(chess.fen()) >= 150) return { result: "1/2-1/2", termination: "seventy_five_move_rule" };
  return null;
}

/** Draws that a player may claim in the current position. */
export function claimableDraw(r: Replay): Outcome | null {
  if (repetitionCount(r.keys) >= 3) return { result: "1/2-1/2", termination: "threefold_repetition" };
  if (halfmoveClock(r.chess.fen()) >= 100) return { result: "1/2-1/2", termination: "fifty_move_rule" };
  return null;
}

export function buildPgn(
  initialFen: string,
  moves: Pick<MoveRecord, "u">[],
  headers: Record<string, string>,
): string {
  const { chess } = replay(initialFen, moves);
  for (const [k, v] of Object.entries(headers)) chess.setHeader(k, v);
  return chess.pgn();
}

export const TERMINATION_LABEL: Record<Termination, string> = {
  checkmate: "Checkmate",
  resignation: "Resignation",
  timeout: "Time out",
  timeout_vs_insufficient_material: "Time out vs. insufficient material",
  stalemate: "Stalemate",
  insufficient_material: "Insufficient material",
  threefold_repetition: "Threefold repetition",
  fivefold_repetition: "Fivefold repetition",
  fifty_move_rule: "50-move rule",
  seventy_five_move_rule: "75-move rule",
  agreement: "Draw by agreement",
  abandonment: "Opponent left the game",
  aborted: "Game aborted",
};
