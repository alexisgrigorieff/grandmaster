import type { Square } from "chess.js";
import type { TrackedPiece } from "@/lib/chess/pieces";
import type { Color } from "@/lib/chess/types";

export interface MoveTarget {
  to: Square;
  capture: boolean;
  promotion: boolean;
}

export interface BoardProps {
  pieces: TrackedPiece[];
  orientation: Color;
  /** Legal moves for the player, keyed by origin square. Empty map = nothing movable. */
  legal: Map<Square, MoveTarget[]>;
  lastMove: { from: Square; to: Square } | null;
  check: Square | null;
  onMove?: (from: Square, to: Square) => void;
  interactive: boolean;
  /** Change this number to reset the camera to its default view. */
  cameraResetKey?: number;
  /** Decorative, slowly rotating board (landing page). */
  showcase?: boolean;
  className?: string;
}
