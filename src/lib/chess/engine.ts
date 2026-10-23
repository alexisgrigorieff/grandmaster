/**
 * Server-authoritative game state machine.
 *
 * Pure functions: given the current row, the acting user, the request and the
 * current time, produce either an error or the patch to write. The API layer
 * (src/lib/server/games.ts) persists the patch with a compare-and-swap on
 * `version`, so two concurrent requests can never both succeed.
 */
import { ABANDONMENT_MS, UNTIMED_MOVE_LIMIT_MS } from "./constants";
import { remainingClocks, sideToMove } from "./clock";
import {
  automaticOutcome,
  buildPgn,
  canEverMate,
  claimableDraw,
  opposite,
  parseUci,
  positionKey,
  replay,
  winResult,
  type Outcome,
} from "./rules";
import type { Color, GameAction, GameRow, MoveRecord } from "./types";

export type GamePatch = Partial<
  Pick<
    GameRow,
    | "status"
    | "result"
    | "termination"
    | "fen"
    | "pgn"
    | "moves"
    | "ply"
    | "white_ms"
    | "black_ms"
    | "turn_started_at"
    | "draw_offer_by"
    | "white_draw_ply"
    | "black_draw_ply"
    | "rematch_offer_by"
    | "finished_at"
  >
> & { version: number };

export type EngineEvent =
  | "move"
  | "timeout"
  | "resign"
  | "draw_offered"
  | "draw_accepted"
  | "draw_declined"
  | "draw_claimed"
  | "abort"
  | "abandonment"
  | "rematch_offered"
  | "rematch_declined"
  | "rematch_cancelled";

export type EngineResult =
  | { ok: true; patch: GamePatch; event: EngineEvent; san?: string }
  | { ok: false; status: number; code: string; message: string };

const err = (status: number, code: string, message: string): EngineResult => ({ ok: false, status, code, message });

export function colorOf(game: Pick<GameRow, "white_id" | "black_id">, userId: string): Color | null {
  if (userId === game.white_id) return "white";
  if (userId === game.black_id) return "black";
  return null;
}

function finish(game: GameRow, outcome: Outcome, now: number, extra: Partial<GamePatch> = {}, ctx: ActionContext = {}): GamePatch {
  const pgn = extra.pgn ?? buildPgn(game.initial_fen, game.moves, pgnHeaders(game, outcome.result, ctx.names));
  return {
    ...extra,
    pgn,
    status: "finished",
    result: outcome.result,
    termination: outcome.termination,
    draw_offer_by: null,
    finished_at: new Date(now).toISOString(),
    version: game.version + 1,
  };
}

/** If the side to move has run out of time, the game result due to flag-fall. */
function flagOutcome(game: GameRow, now: number): Outcome | null {
  if (game.status !== "active" || game.initial_ms == null) return null;
  const clocks = remainingClocks(game, now);
  const mover = sideToMove(game);
  const left = mover === "white" ? clocks.white : clocks.black;
  if (left == null || left > 0) return null;
  const { chess } = replay(game.initial_fen, game.moves);
  const winner = opposite(mover);
  if (!canEverMate(chess, winner)) return { result: "1/2-1/2", termination: "timeout_vs_insufficient_material" };
  return { result: winResult(winner), termination: "timeout" };
}

function frozenClocks(game: GameRow, now: number): Pick<GamePatch, "white_ms" | "black_ms"> {
  if (game.initial_ms == null) return {};
  const c = remainingClocks(game, now);
  return { white_ms: c.white, black_ms: c.black };
}

function pgnHeaders(game: GameRow, result: string | null, names?: { white: string; black: string }): Record<string, string> {
  return {
    Event: game.rated ? "Rated game" : "Casual game",
    Site: "Grandmaster",
    Date: game.created_at.slice(0, 10).replace(/-/g, "."),
    White: names?.white ?? game.white_id,
    Black: names?.black ?? game.black_id,
    Result: result ?? "*",
    ...(game.initial_ms != null
      ? { TimeControl: `${Math.round(game.initial_ms / 1000)}+${Math.round(game.increment_ms / 1000)}` }
      : {}),
  };
}

export interface ActionContext {
  /** When the opponent was last seen in this game (ms epoch), for abandonment claims. */
  opponentLastSeen?: number | null;
  /** Usernames for the PGN headers. */
  names?: { white: string; black: string };
}

export interface MoveInput {
  uci: string;
  /** The ply the client believes the game is at (guards against duplicates / out-of-order). */
  ply: number;
}

export function applyMove(game: GameRow, userId: string, input: MoveInput, now: number, ctx: ActionContext = {}): EngineResult {
  const color = colorOf(game, userId);
  if (!color) return err(403, "NOT_A_PLAYER", "You are not playing in this game.");
  if (game.status !== "active") return err(409, "GAME_OVER", "This game has already finished.");
  if (input.ply !== game.ply) return err(409, "STALE_PLY", "The position has changed. Syncing…");

  const mover = sideToMove(game);
  if (mover !== color) return err(409, "NOT_YOUR_TURN", "It is not your turn.");

  const parsed = parseUci(input.uci);
  if (!parsed) return err(400, "BAD_MOVE", "Malformed move.");

  // Flag-fall takes precedence over a move that arrives too late.
  const flagged = flagOutcome(game, now);
  if (flagged) {
    const patch = finish(game, flagged, now, frozenClocks(game, now), ctx);
    return { ok: true, patch, event: "timeout" };
  }

  const r = replay(game.initial_fen, game.moves);
  let move;
  try {
    move = r.chess.move(parsed);
  } catch {
    return err(422, "ILLEGAL_MOVE", "That move is not legal.");
  }
  r.verbose.push(move);
  r.keys.push(positionKey(r.chess.fen()));

  // Clocks: the first move of each side is free; afterwards deduct the time
  // spent and add the increment.
  let white_ms = game.white_ms;
  let black_ms = game.black_ms;
  if (game.initial_ms != null) {
    const clocks = remainingClocks(game, now);
    if (game.ply >= 2) {
      if (color === "white") white_ms = (clocks.white ?? 0) + game.increment_ms;
      else black_ms = (clocks.black ?? 0) + game.increment_ms;
    }
  }

  const record: MoveRecord = {
    u: `${move.from}${move.to}${move.promotion ?? ""}`,
    s: move.san,
    c: game.initial_ms != null ? (color === "white" ? white_ms : black_ms) : null,
  };
  const moves = [...game.moves, record];

  // A pending draw offer to the mover is declined by moving.
  const draw_offer_by = game.draw_offer_by && game.draw_offer_by !== userId ? null : game.draw_offer_by;

  const outcome = automaticOutcome(r);
  const base: GamePatch = {
    fen: r.chess.fen(),
    moves,
    ply: game.ply + 1,
    white_ms,
    black_ms,
    turn_started_at: new Date(now).toISOString(),
    draw_offer_by,
    pgn: "",
    version: game.version + 1,
  };
  const headers = pgnHeaders(game, outcome?.result ?? null, ctx.names);
  for (const [k, v] of Object.entries(headers)) r.chess.setHeader(k, v);
  base.pgn = r.chess.pgn();

  const patch = outcome ? finish(game, outcome, now, base) : base;
  return { ok: true, patch, event: "move", san: move.san };
}


export function applyAction(
  game: GameRow,
  userId: string,
  action: Exclude<GameAction, "accept_rematch">,
  now: number,
  ctx: ActionContext = {},
): EngineResult {
  const color = colorOf(game, userId);
  if (!color) return err(403, "NOT_A_PLAYER", "You are not playing in this game.");
  const opponentColor = opposite(color);
  const v = game.version + 1;

  // --- Post-game actions --------------------------------------------------
  if (action === "offer_rematch" || action === "decline_rematch" || action === "cancel_rematch") {
    if (game.status === "active") return err(409, "GAME_NOT_OVER", "The game is still in progress.");
    if (game.rematch_game_id) return err(409, "REMATCH_EXISTS", "A rematch has already started.");
    if (action === "offer_rematch") {
      if (game.rematch_offer_by === userId) return err(409, "ALREADY_OFFERED", "You already offered a rematch.");
      if (game.rematch_offer_by) return err(409, "OFFER_PENDING", "Your opponent already offered a rematch — accept it instead.");
      return { ok: true, patch: { rematch_offer_by: userId, version: v }, event: "rematch_offered" };
    }
    if (action === "decline_rematch") {
      if (!game.rematch_offer_by || game.rematch_offer_by === userId) return err(409, "NO_OFFER", "There is no rematch offer to decline.");
      return { ok: true, patch: { rematch_offer_by: null, version: v }, event: "rematch_declined" };
    }
    if (game.rematch_offer_by !== userId) return err(409, "NO_OFFER", "You have no rematch offer to cancel.");
    return { ok: true, patch: { rematch_offer_by: null, version: v }, event: "rematch_cancelled" };
  }

  if (game.status !== "active") return err(409, "GAME_OVER", "This game has already finished.");

  // A fallen flag always wins the race against any other action.
  const flagged = flagOutcome(game, now);
  if (flagged) {
    return { ok: true, patch: finish(game, flagged, now, frozenClocks(game, now), ctx), event: "timeout" };
  }

  switch (action) {
    case "flag":
      return err(409, "CLOCK_NOT_EXPIRED", "No clock has run out.");

    case "resign": {
      if (game.ply < 2) {
        return {
          ok: true,
          patch: { status: "aborted", termination: "aborted", ...frozenClocks(game, now), finished_at: new Date(now).toISOString(), draw_offer_by: null, version: v },
          event: "abort",
        };
      }
      return {
        ok: true,
        patch: finish(game, { result: winResult(opponentColor), termination: "resignation" }, now, frozenClocks(game, now), ctx),
        event: "resign",
      };
    }

    case "abort": {
      if (game.ply >= 2) return err(409, "TOO_LATE_TO_ABORT", "Games can only be aborted before both players have moved.");
      return {
        ok: true,
        patch: { status: "aborted", termination: "aborted", finished_at: new Date(now).toISOString(), draw_offer_by: null, version: v },
        event: "abort",
      };
    }

    case "offer_draw": {
      if (game.ply < 2) return err(409, "TOO_EARLY", "Make a move before offering a draw.");
      if (game.draw_offer_by === userId) return err(409, "ALREADY_OFFERED", "You already offered a draw.");
      if (game.draw_offer_by) {
        // Opponent already offered: offering back means accepting.
        return { ok: true, patch: finish(game, { result: "1/2-1/2", termination: "agreement" }, now, frozenClocks(game, now), ctx), event: "draw_accepted" };
      }
      const last = color === "white" ? game.white_draw_ply : game.black_draw_ply;
      if (last != null && game.ply - last < 2) return err(429, "DRAW_COOLDOWN", "You can offer another draw after the next move.");
      return {
        ok: true,
        patch: { draw_offer_by: userId, [color === "white" ? "white_draw_ply" : "black_draw_ply"]: game.ply, version: v },
        event: "draw_offered",
      };
    }

    case "accept_draw": {
      if (!game.draw_offer_by || game.draw_offer_by === userId) return err(409, "NO_OFFER", "There is no draw offer to accept.");
      return { ok: true, patch: finish(game, { result: "1/2-1/2", termination: "agreement" }, now, frozenClocks(game, now), ctx), event: "draw_accepted" };
    }

    case "decline_draw": {
      if (!game.draw_offer_by || game.draw_offer_by === userId) return err(409, "NO_OFFER", "There is no draw offer to decline.");
      return { ok: true, patch: { draw_offer_by: null, version: v }, event: "draw_declined" };
    }

    case "claim_draw": {
      const r = replay(game.initial_fen, game.moves);
      const claim = claimableDraw(r);
      if (!claim) return err(409, "NO_CLAIM", "There is no draw to claim in this position.");
      return { ok: true, patch: finish(game, claim, now, frozenClocks(game, now), ctx), event: "draw_claimed" };
    }

    case "claim_abandonment": {
      const lastSeen = ctx.opponentLastSeen ?? Date.parse(game.created_at);
      const opponentToMove = sideToMove(game) === opponentColor;
      const gone = now - lastSeen >= ABANDONMENT_MS;
      // Untimed games: an opponent who sits on their move for too long can be claimed against too.
      const stalled =
        game.initial_ms == null && game.turn_started_at != null && now - Date.parse(game.turn_started_at) >= UNTIMED_MOVE_LIMIT_MS;
      if (game.ply >= 2 && !opponentToMove) {
        return err(409, "YOUR_MOVE", "It's your move — you can only claim while your opponent is to move.");
      }
      if (!gone && !stalled) {
        return err(409, "OPPONENT_PRESENT", "Your opponent has not been gone long enough.");
      }
      if (game.ply < 2) {
        return {
          ok: true,
          patch: { status: "aborted", termination: "aborted", finished_at: new Date(now).toISOString(), draw_offer_by: null, version: v },
          event: "abort",
        };
      }
      return {
        ok: true,
        patch: finish(game, { result: winResult(color), termination: "abandonment" }, now, frozenClocks(game, now), ctx),
        event: "abandonment",
      };
    }
  }
  return err(400, "UNKNOWN_ACTION", "Unknown action.");
}
