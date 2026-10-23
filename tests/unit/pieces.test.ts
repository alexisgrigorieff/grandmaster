import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { materialBalance, trackPieces } from "@/lib/chess/pieces";
import { START_FEN } from "@/lib/chess/constants";

function verbose(fen: string, sans: string[]) {
  const c = new Chess(fen);
  for (const s of sans) c.move(s);
  return c.history({ verbose: true });
}

describe("piece tracking", () => {
  it("keeps stable ids and follows castling rooks", () => {
    const t = trackPieces(START_FEN, verbose(START_FEN, ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "O-O"]));
    const king = t.pieces.find((p) => p.type === "k" && p.color === "w")!;
    const rook = t.pieces.find((p) => p.id === "wr2")!;
    expect(king.square).toBe("g1");
    expect(rook.square).toBe("f1");
    expect(t.pieces).toHaveLength(32);
  });

  it("removes en-passant victims from the right square", () => {
    const t = trackPieces(START_FEN, verbose(START_FEN, ["e4", "a6", "e5", "d5", "exd6"]));
    expect(t.pieces).toHaveLength(31);
    expect(t.pieces.find((p) => p.square === "d5")).toBeUndefined();
    expect(t.captured.b).toEqual(["p"]);
  });

  it("promotes in place and counts material", () => {
    const fen = "1r5k/P7/8/8/8/8/8/K7 w - - 0 1";
    const t = trackPieces(fen, verbose(fen, ["axb8=Q+"]));
    const q = t.pieces.find((p) => p.square === "b8")!;
    expect(q).toMatchObject({ type: "q", color: "w", id: "wp1" });
    expect(t.captured.b).toEqual(["r"]);
    expect(materialBalance(t)).toBe(5);
  });

  it("is consistent with chess.js for a full game", () => {
    const c = new Chess();
    // Opera Game, Morphy vs Duke Karl / Count Isouard, 1858
    const opera = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");
    for (const s of opera) c.move(s);
    const t = trackPieces(START_FEN, c.history({ verbose: true }));
    for (const p of t.pieces) {
      expect(c.get(p.square)).toEqual({ type: p.type, color: p.color });
    }
    const occupied = c.board().flat().filter(Boolean).length;
    expect(t.pieces).toHaveLength(occupied);
  });
});
