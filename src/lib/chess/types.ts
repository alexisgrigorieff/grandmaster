export type Color = "white" | "black";
export type GameStatus = "active" | "finished" | "aborted";
export type GameResult = "1-0" | "0-1" | "1/2-1/2";

export type Termination =
  | "checkmate"
  | "resignation"
  | "timeout"
  | "timeout_vs_insufficient_material"
  | "stalemate"
  | "insufficient_material"
  | "threefold_repetition"
  | "fivefold_repetition"
  | "fifty_move_rule"
  | "seventy_five_move_rule"
  | "agreement"
  | "abandonment"
  | "aborted";

/** One move as stored in `games.moves`. */
export interface MoveRecord {
  /** UCI, e.g. "e2e4", "e7e8q" */
  u: string;
  /** SAN, e.g. "e4", "exd8=Q+" */
  s: string;
  /** Mover's remaining clock after the move (ms), null for untimed games. */
  c?: number | null;
}

export interface GameRow {
  id: string;
  white_id: string;
  black_id: string;
  status: GameStatus;
  result: GameResult | null;
  termination: Termination | null;
  initial_fen: string;
  fen: string;
  pgn: string;
  moves: MoveRecord[];
  ply: number;
  version: number;
  initial_ms: number | null;
  increment_ms: number;
  white_ms: number | null;
  black_ms: number | null;
  turn_started_at: string | null;
  draw_offer_by: string | null;
  white_draw_ply: number | null;
  black_draw_ply: number | null;
  rematch_offer_by: string | null;
  rematch_game_id: string | null;
  rated: boolean;
  source: "challenge" | "quickplay" | "rematch";
  white_rating: number | null;
  black_rating: number | null;
  white_rating_diff: number | null;
  black_rating_diff: number | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  avatar_preset: string;
  bio: string;
  rating: number;
  rated_games: number;
  preferences: Record<string, unknown>;
  created_at: string;
}

export type PublicProfile = Pick<
  Profile,
  "id" | "username" | "display_name" | "avatar_url" | "avatar_preset" | "rating"
>;

export interface Challenge {
  id: string;
  from_id: string;
  to_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  color: "white" | "black" | "random";
  initial_ms: number | null;
  increment_ms: number;
  rated: boolean;
  game_id: string | null;
  created_at: string;
  expires_at: string;
  responded_at: string | null;
}

export type GameAction =
  | "resign"
  | "offer_draw"
  | "accept_draw"
  | "decline_draw"
  | "claim_draw"
  | "abort"
  | "flag"
  | "claim_abandonment"
  | "offer_rematch"
  | "accept_rematch"
  | "decline_rematch"
  | "cancel_rematch";

export const PROFILE_COLUMNS = "id, username, display_name, avatar_url, avatar_preset, bio, rating, rated_games, created_at";
export const PUBLIC_PROFILE_COLUMNS = "id, username, display_name, avatar_url, avatar_preset, rating";
