import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { applyAction, applyMove, type EngineResult } from "@/lib/chess/engine";
import { START_FEN } from "@/lib/chess/constants";
import { canEverMate } from "@/lib/chess/rules";
import { formatClock, remainingClocks } from "@/lib/chess/clock";
import type { GameRow } from "@/lib/chess/types";

const W = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const T0 = Date.parse("2026-01-01T12:00:00Z");

function makeGame(over: Partial<GameRow> = {}): GameRow {
  const fen = over.initial_fen ?? START_FEN;
  return {
    id: "g1",
    white_id: W,
    black_id: B,
    status: "active",
    result: null,
    termination: null,
    initial_fen: fen,
    fen,
    pgn: "",
    moves: [],
    ply: 0,
    version: 0,
    initial_ms: null,
    increment_ms: 0,
    white_ms: null,
    black_ms: null,
    turn_started_at: null,
    draw_offer_by: null,
    white_draw_ply: null,
    black_draw_ply: null,
    rematch_offer_by: null,
    rematch_game_id: null,
    rated: true,
    source: "challenge",
    white_rating: null,
    black_rating: null,
    white_rating_diff: null,
    black_rating_diff: null,
    created_at: new Date(T0).toISOString(),
    updated_at: new Date(T0).toISOString(),
    finished_at: null,
    ...over,
  };
}

function ok(r: EngineResult) {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.message}`);
  return r;
}

/** Apply a list of UCI moves (alternating players) and return the resulting row. */
function play(game: GameRow, ucis: string[], stepMs = 1000): GameRow {
  let g = game;
  let t = g.turn_started_at ? Date.parse(g.turn_started_at) : T0;
  for (const u of ucis) {
    t += stepMs;
    const mover = g.fen.split(" ")[1] === "w" ? g.white_id : g.black_id;
    const r = ok(applyMove(g, mover, { uci: u, ply: g.ply }, t));
    g = { ...g, ...r.patch } as GameRow;
  }
  return g;
}

describe("move validation", () => {
  it("accepts a legal move and advances the game", () => {
    const r = ok(applyMove(makeGame(), W, { uci: "e2e4", ply: 0 }, T0));
    expect(r.san).toBe("e4");
    expect(r.patch.ply).toBe(1);
    expect(r.patch.version).toBe(1);
    expect(r.patch.fen).toBe(new Chess().move("e4").after);
    expect(r.patch.moves).toEqual([{ u: "e2e4", s: "e4", c: null }]);
  });

  it("rejects illegal moves", () => {
    const r = applyMove(makeGame(), W, { uci: "e2e5", ply: 0 }, T0);
    expect(r).toMatchObject({ ok: false, code: "ILLEGAL_MOVE", status: 422 });
  });

  it("rejects malformed input", () => {
    expect(applyMove(makeGame(), W, { uci: "hello", ply: 0 }, T0)).toMatchObject({ ok: false, code: "BAD_MOVE" });
    expect(applyMove(makeGame(), W, { uci: "e2e4x", ply: 0 }, T0)).toMatchObject({ ok: false, code: "BAD_MOVE" });
  });

  it("rejects moves out of turn", () => {
    expect(applyMove(makeGame(), B, { uci: "e7e5", ply: 0 }, T0)).toMatchObject({ ok: false, code: "NOT_YOUR_TURN" });
  });

  it("prevents a player from moving the opponent's pieces", () => {
    // White to move tries to push a black pawn.
    expect(applyMove(makeGame(), W, { uci: "e7e5", ply: 0 }, T0)).toMatchObject({ ok: false, code: "ILLEGAL_MOVE" });
  });

  it("rejects non-participants", () => {
    expect(applyMove(makeGame(), "intruder", { uci: "e2e4", ply: 0 }, T0)).toMatchObject({ ok: false, status: 403 });
  });

  it("rejects duplicate and out-of-order submissions via the ply guard", () => {
    const g = play(makeGame(), ["e2e4"]);
    // The same request arriving twice is stale the second time.
    expect(applyMove(g, W, { uci: "e2e4", ply: 0 }, T0)).toMatchObject({ ok: false, code: "STALE_PLY" });
    // A move for a future ply is also stale.
    expect(applyMove(g, B, { uci: "e7e5", ply: 5 }, T0)).toMatchObject({ ok: false, code: "STALE_PLY" });
  });

  it("rejects moves in a finished game", () => {
    const g = makeGame({ status: "finished", result: "1-0", termination: "resignation" });
    expect(applyMove(g, W, { uci: "e2e4", ply: 0 }, T0)).toMatchObject({ ok: false, code: "GAME_OVER" });
  });
});

describe("special moves", () => {
  it("allows kingside and queenside castling", () => {
    const g = play(makeGame({ initial_fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1" }), ["e1g1", "e8c8"]);
    expect(g.moves.map((m) => m.s)).toEqual(["O-O", "O-O-O"]);
    expect(g.fen.startsWith("2kr3r/8/8/8/8/8/8/R4RK1")).toBe(true);
  });

  it("forbids castling through check", () => {
    // Black bishop on c4 attacks f1.
    const g = makeGame({ initial_fen: "4k3/8/8/8/2b5/8/8/R3K2R w KQ - 0 1" });
    expect(applyMove(g, W, { uci: "e1g1", ply: 0 }, T0)).toMatchObject({ ok: false, code: "ILLEGAL_MOVE" });
    expect(ok(applyMove(g, W, { uci: "e1c1", ply: 0 }, T0)).san).toBe("O-O-O");
  });

  it("forbids castling out of check", () => {
    const g = makeGame({ initial_fen: "4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1" });
    expect(applyMove(g, W, { uci: "e1g1", ply: 0 }, T0)).toMatchObject({ ok: false, code: "ILLEGAL_MOVE" });
  });

  it("forbids castling after the king has moved", () => {
    const g = play(makeGame({ initial_fen: "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1" }), ["e1f1", "e8d8", "f1e1", "d8e8"]);
    expect(applyMove(g, W, { uci: "e1g1", ply: g.ply }, T0 + 99_000)).toMatchObject({ ok: false, code: "ILLEGAL_MOVE" });
  });

  it("removes castling rights on the side whose rook moved", () => {
    const g = play(makeGame({ initial_fen: "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1" }), ["h1h2", "e8d8", "h2h1", "d8e8"]);
    expect(applyMove(g, W, { uci: "e1g1", ply: g.ply }, T0 + 99_000)).toMatchObject({ ok: false, code: "ILLEGAL_MOVE" });
    expect(ok(applyMove(g, W, { uci: "e1c1", ply: g.ply }, T0 + 99_000)).san).toBe("O-O-O");
  });

  it("supports en passant immediately after the double push only", () => {
    const g = play(makeGame(), ["e2e4", "a7a6", "e4e5", "d7d5"]);
    const r = ok(applyMove(g, W, { uci: "e5d6", ply: 4 }, T0 + 10_000));
    expect(r.san).toBe("exd6");
    expect(r.patch.fen!.split(" ")[0]).toBe("rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR");

    const late = play(g, ["h2h3", "h7h6"]);
    expect(applyMove(late, W, { uci: "e5d6", ply: late.ply }, T0 + 20_000)).toMatchObject({ ok: false, code: "ILLEGAL_MOVE" });
  });

  it("requires a promotion piece and supports under-promotion", () => {
    const g = makeGame({ initial_fen: "8/4P3/8/8/8/8/k7/4K3 w - - 0 1" });
    expect(applyMove(g, W, { uci: "e7e8", ply: 0 }, T0)).toMatchObject({ ok: false, code: "ILLEGAL_MOVE" });
    const r = ok(applyMove(g, W, { uci: "e7e8n", ply: 0 }, T0));
    expect(r.san).toBe("e8=N");
    expect(r.patch.fen!.startsWith("4N3/")).toBe(true);
  });
});

describe("automatic endings", () => {
  it("detects checkmate (fool's mate)", () => {
    const g = play(makeGame(), ["f2f3", "e7e5", "g2g4", "d8h4"]);
    expect(g.status).toBe("finished");
    expect(g.result).toBe("0-1");
    expect(g.termination).toBe("checkmate");
    expect(g.pgn).toContain('[Result "0-1"]');
    expect(g.pgn).toContain("Qh4#");
  });

  it("detects stalemate", () => {
    const g = play(makeGame({ initial_fen: "k7/8/1Q6/8/8/8/8/7K w - - 0 1" }), ["b6c7"]);
    // Qc7 — black king on a8 has no moves and is not in check.
    expect(g.status).toBe("finished");
    expect(g.termination).toBe("stalemate");
    expect(g.result).toBe("1/2-1/2");
  });

  it("detects insufficient material after a capture", () => {
    const g = play(makeGame({ initial_fen: "8/8/8/8/8/k7/3p4/3BK3 w - - 0 1" }), ["e1d2"]);
    // K+B vs K
    expect(g.termination).toBe("insufficient_material");
  });

  it("draws automatically on fivefold repetition", () => {
    const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8"];
    let g = play(makeGame(), [...shuffle, ...shuffle, ...shuffle]); // position occurs 4 times
    expect(g.status).toBe("active");
    g = play(g, shuffle); // 5th occurrence
    expect(g.status).toBe("finished");
    expect(g.termination).toBe("fivefold_repetition");
  });

  it("draws automatically under the 75-move rule", () => {
    const g = play(makeGame({ initial_fen: "8/8/8/4k3/8/8/1R6/4K3 w - - 149 120" }), ["b2b3"]);
    expect(g.termination).toBe("seventy_five_move_rule");
  });

  it("lets checkmate take precedence over the 75-move rule", () => {
    const g = play(makeGame({ initial_fen: "7k/8/6K1/8/8/8/8/R7 w - - 149 120" }), ["a1a8"]);
    expect(g.termination).toBe("checkmate");
    expect(g.result).toBe("1-0");
  });
});

describe("draw claims and offers", () => {
  it("allows claiming threefold repetition only when it has occurred", () => {
    const shuffle = ["g1f3", "g8f6", "f3g1", "f6g8"];
    let g = play(makeGame(), shuffle); // start position seen twice
    expect(applyAction(g, W, "claim_draw", T0 + 50_000)).toMatchObject({ ok: false, code: "NO_CLAIM" });
    g = play(g, shuffle); // three times
    const r = ok(applyAction(g, B, "claim_draw", T0 + 50_000));
    expect(r.patch).toMatchObject({ status: "finished", result: "1/2-1/2", termination: "threefold_repetition" });
  });

  it("allows claiming the 50-move rule", () => {
    const base = makeGame({ initial_fen: "8/8/8/4k3/8/8/1R6/4K3 w - - 99 80" });
    expect(applyAction(base, W, "claim_draw", T0)).toMatchObject({ ok: false, code: "NO_CLAIM" });
    const g = play(base, ["b2b3"]);
    expect(ok(applyAction(g, B, "claim_draw", T0 + 10_000)).patch.termination).toBe("fifty_move_rule");
  });

  it("handles offer → accept", () => {
    const g = play(makeGame(), ["e2e4", "e7e5"]);
    const offered = { ...g, ...ok(applyAction(g, W, "offer_draw", T0 + 5000)).patch } as GameRow;
    expect(offered.draw_offer_by).toBe(W);
    expect(applyAction(offered, W, "accept_draw", T0 + 6000)).toMatchObject({ ok: false, code: "NO_OFFER" });
    const r = ok(applyAction(offered, B, "accept_draw", T0 + 6000));
    expect(r.patch).toMatchObject({ status: "finished", result: "1/2-1/2", termination: "agreement" });
  });

  it("handles offer → decline, and rate-limits repeated offers", () => {
    const g = play(makeGame(), ["e2e4", "e7e5"]);
    const offered = { ...g, ...ok(applyAction(g, W, "offer_draw", T0 + 5000)).patch } as GameRow;
    const declined = { ...offered, ...ok(applyAction(offered, B, "decline_draw", T0 + 6000)).patch } as GameRow;
    expect(declined.draw_offer_by).toBeNull();
    expect(applyAction(declined, W, "offer_draw", T0 + 7000)).toMatchObject({ ok: false, code: "DRAW_COOLDOWN" });
    const later = play(declined, ["g1f3", "b8c6"]);
    expect(ok(applyAction(later, W, "offer_draw", T0 + 20_000)).event).toBe("draw_offered");
  });

  it("treats a move by the recipient as declining the offer", () => {
    const g = play(makeGame(), ["e2e4", "e7e5", "g1f3"]);
    const offered = { ...g, ...ok(applyAction(g, W, "offer_draw", T0 + 5000)).patch } as GameRow;
    const after = play(offered, ["b8c6"]);
    expect(after.draw_offer_by).toBeNull();
  });

  it("keeps an offer pending when the offerer moves", () => {
    const g = play(makeGame(), ["e2e4", "e7e5"]);
    const offered = { ...g, ...ok(applyAction(g, W, "offer_draw", T0 + 5000)).patch } as GameRow;
    const after = play(offered, ["g1f3"]);
    expect(after.draw_offer_by).toBe(W);
  });
});

describe("resign and abort", () => {
  it("resignation awards the win to the opponent", () => {
    const g = play(makeGame(), ["e2e4", "e7e5"]);
    expect(ok(applyAction(g, W, "resign", T0 + 9000)).patch).toMatchObject({ result: "0-1", termination: "resignation" });
    expect(ok(applyAction(g, B, "resign", T0 + 9000)).patch).toMatchObject({ result: "1-0", termination: "resignation" });
  });

  it("resigning before both players have moved aborts the game", () => {
    const g = play(makeGame(), ["e2e4"]);
    expect(ok(applyAction(g, B, "resign", T0 + 9000)).patch.status).toBe("aborted");
  });

  it("only allows aborting before both sides have moved", () => {
    expect(ok(applyAction(makeGame(), B, "abort", T0)).patch.status).toBe("aborted");
    const g = play(makeGame(), ["e2e4", "e7e5"]);
    expect(applyAction(g, W, "abort", T0 + 9000)).toMatchObject({ ok: false, code: "TOO_LATE_TO_ABORT" });
  });

  it("rejects actions on finished games", () => {
    const g = makeGame({ status: "finished", result: "1-0", termination: "resignation" });
    expect(applyAction(g, W, "resign", T0)).toMatchObject({ ok: false, code: "GAME_OVER" });
  });
});

describe("clocks", () => {
  const timed = () => makeGame({ initial_ms: 60_000, increment_ms: 2_000, white_ms: 60_000, black_ms: 60_000 });

  it("does not run the clock until both players have moved", () => {
    let g = timed();
    g = { ...g, ...ok(applyMove(g, W, { uci: "e2e4", ply: 0 }, T0 + 30_000)).patch } as GameRow;
    g = { ...g, ...ok(applyMove(g, B, { uci: "e7e5", ply: 1 }, T0 + 50_000)).patch } as GameRow;
    expect(g.white_ms).toBe(60_000);
    expect(g.black_ms).toBe(60_000);
    expect(g.turn_started_at).toBe(new Date(T0 + 50_000).toISOString());
  });

  it("deducts thinking time and adds the increment", () => {
    let g = play(timed(), ["e2e4", "e7e5"]); // turn started at T0+2000
    g = { ...g, ...ok(applyMove(g, W, { uci: "g1f3", ply: 2 }, T0 + 2000 + 10_000)).patch } as GameRow;
    expect(g.white_ms).toBe(60_000 - 10_000 + 2_000);
    expect(g.moves[2].c).toBe(52_000);
    const clocks = remainingClocks(g, T0 + 12_000 + 5_000);
    expect(clocks).toEqual({ white: 52_000, black: 55_000 });
  });

  it("ends the game on time when a move arrives after the flag falls", () => {
    const g = play(timed(), ["e2e4", "e7e5"]);
    const r = ok(applyMove(g, W, { uci: "g1f3", ply: 2 }, T0 + 2000 + 61_000));
    expect(r.event).toBe("timeout");
    expect(r.patch).toMatchObject({ status: "finished", result: "0-1", termination: "timeout", white_ms: 0 });
    expect(r.patch.ply).toBeUndefined(); // the late move was not played
  });

  it("lets either player claim a fallen flag, and only when it has fallen", () => {
    const g = play(timed(), ["e2e4", "e7e5"]);
    expect(applyAction(g, B, "flag", T0 + 2000 + 30_000)).toMatchObject({ ok: false, code: "CLOCK_NOT_EXPIRED" });
    expect(ok(applyAction(g, B, "flag", T0 + 2000 + 60_001)).patch.result).toBe("0-1");
    expect(ok(applyAction(g, W, "flag", T0 + 2000 + 60_001)).patch.result).toBe("0-1");
  });

  it("draws on time when the opponent cannot possibly mate", () => {
    const g = play(
      makeGame({ initial_fen: "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1", initial_ms: 60_000, white_ms: 60_000, black_ms: 60_000 }),
      ["e2e3", "e8d8"],
    );
    const r = ok(applyAction(g, B, "flag", T0 + 2000 + 61_000));
    expect(r.patch).toMatchObject({ result: "1/2-1/2", termination: "timeout_vs_insufficient_material" });
  });

  it("freezes the clocks when the game ends by resignation", () => {
    const g = play(timed(), ["e2e4", "e7e5"]);
    const r = ok(applyAction(g, W, "resign", T0 + 2000 + 7_000));
    expect(r.patch.white_ms).toBe(53_000);
    expect(r.patch.black_ms).toBe(60_000);
  });
});

describe("abandonment", () => {
  it("lets a player claim the win once the opponent has been gone long enough", () => {
    const g = play(makeGame(), ["e2e4", "e7e5"]);
    // White is to move and has gone quiet; Black claims.
    expect(applyAction(g, B, "claim_abandonment", T0 + 100_000, { opponentLastSeen: T0 + 90_000 })).toMatchObject({
      ok: false,
      code: "OPPONENT_PRESENT",
    });
    const r = ok(applyAction(g, B, "claim_abandonment", T0 + 200_000, { opponentLastSeen: T0 + 90_000 }));
    expect(r.patch).toMatchObject({ result: "0-1", termination: "abandonment" });
  });

  it("only allows the claim while the opponent is the one to move", () => {
    const g = play(makeGame(), ["e2e4", "e7e5", "g1f3"]); // Black to move
    expect(applyAction(g, B, "claim_abandonment", T0 + 999_000, { opponentLastSeen: T0 })).toMatchObject({ ok: false, code: "YOUR_MOVE" });
    expect(ok(applyAction(g, W, "claim_abandonment", T0 + 999_000, { opponentLastSeen: T0 })).patch.result).toBe("1-0");
  });

  it("lets a player claim an untimed game the opponent has stalled, even if still connected", () => {
    const g = play(makeGame(), ["e2e4", "e7e5", "g1f3"]); // Black to move, turn started at T0+3000
    expect(applyAction(g, W, "claim_abandonment", T0 + 3000 + 10 * 60_000, { opponentLastSeen: T0 + 3000 + 10 * 60_000 })).toMatchObject({ ok: false, code: "OPPONENT_PRESENT" });
    const r = ok(applyAction(g, W, "claim_abandonment", T0 + 3000 + 31 * 60_000, { opponentLastSeen: T0 + 3000 + 31 * 60_000 }));
    expect(r.patch.termination).toBe("abandonment");
  });

  it("aborts instead when the game barely started", () => {
    const r = ok(applyAction(makeGame(), B, "claim_abandonment", T0 + 200_000, { opponentLastSeen: null }));
    expect(r.patch.status).toBe("aborted");
  });
});

describe("rematch offers", () => {
  const done = () => makeGame({ status: "finished", result: "1-0", termination: "checkmate" });

  it("can be offered, declined and cancelled", () => {
    expect(applyAction(makeGame(), W, "offer_rematch", T0)).toMatchObject({ ok: false, code: "GAME_NOT_OVER" });
    const offered = { ...done(), ...ok(applyAction(done(), W, "offer_rematch", T0)).patch } as GameRow;
    expect(offered.rematch_offer_by).toBe(W);
    expect(applyAction(offered, W, "decline_rematch", T0)).toMatchObject({ ok: false });
    expect(ok(applyAction(offered, B, "decline_rematch", T0)).patch.rematch_offer_by).toBeNull();
    expect(ok(applyAction(offered, W, "cancel_rematch", T0)).patch.rematch_offer_by).toBeNull();
  });
});

describe("helpers", () => {
  it("knows which material can still mate", () => {
    expect(canEverMate(new Chess("4k3/8/8/8/8/8/8/4K3 w - - 0 1"), "white")).toBe(false);
    expect(canEverMate(new Chess("4k3/8/8/8/8/8/8/3NK3 w - - 0 1"), "white")).toBe(false);
    expect(canEverMate(new Chess("4k3/7p/8/8/8/8/8/3NK3 w - - 0 1"), "white")).toBe(true);
    expect(canEverMate(new Chess("4k3/8/8/8/8/8/8/2NNK3 w - - 0 1"), "white")).toBe(true);
    expect(canEverMate(new Chess("4k3/8/8/8/8/8/8/1B1BK3 w - - 0 1"), "white")).toBe(false);
    expect(canEverMate(new Chess("4k3/8/8/8/8/8/8/2BBK3 w - - 0 1"), "white")).toBe(true);
    expect(canEverMate(new Chess("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"), "white")).toBe(true);
  });

  it("formats clocks", () => {
    expect(formatClock(300_000)).toBe("5:00");
    expect(formatClock(61_500)).toBe("1:02");
    expect(formatClock(9_450)).toBe("0:09.4");
    expect(formatClock(3_725_000)).toBe("1:02:05");
    expect(formatClock(null)).toBe("∞");
  });
});
