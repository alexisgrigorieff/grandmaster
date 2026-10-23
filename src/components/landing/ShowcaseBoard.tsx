"use client";

import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { BoardView } from "@/components/board/BoardView";
import { trackPieces } from "@/lib/chess/pieces";
import { START_FEN } from "@/lib/chess/constants";

// Paul Morphy vs. Duke Karl of Brunswick & Count Isouard, Paris 1858 — "The Opera Game".
const OPERA = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#".split(" ");

const VERBOSE = (() => {
  const c = new Chess();
  for (const m of OPERA) c.move(m);
  return c.history({ verbose: true });
})();

export function ShowcaseBoard() {
  const [ply, setPly] = useState(6);
  useEffect(() => {
    const t = setInterval(() => setPly((p) => (p >= VERBOSE.length + 3 ? 0 : p + 1)), 1500);
    return () => clearInterval(t);
  }, []);
  const shown = Math.min(ply, VERBOSE.length);
  const { pieces, last, check } = useMemo(() => {
    const v = VERBOSE.slice(0, shown);
    const t = trackPieces(START_FEN, v);
    const lastMove = v[v.length - 1];
    const pos = new Chess(lastMove ? lastMove.after : START_FEN);
    let ck = null;
    if (pos.inCheck()) for (const row of pos.board()) for (const p of row) if (p?.type === "k" && p.color === pos.turn()) ck = p.square;
    return { pieces: t.pieces, last: lastMove ? { from: lastMove.from, to: lastMove.to } : null, check: ck };
  }, [shown]);
  return <BoardView pieces={pieces} orientation="white" legal={new Map()} lastMove={last} check={check} interactive={false} showcase forceMode="3d" />;
}
