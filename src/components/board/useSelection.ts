"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Square } from "chess.js";
import type { MoveTarget } from "./types";

/** Click-to-move selection logic shared by the 2D and 3D boards. */
export function useSelection(legal: Map<Square, MoveTarget[]>, interactive: boolean, onMove?: (from: Square, to: Square) => void) {
  const [selected, setSelected] = useState<Square | null>(null);

  useEffect(() => {
    if (!interactive || (selected && !legal.has(selected))) setSelected(null);
  }, [legal, interactive, selected]);

  const targets = useMemo(() => (selected ? (legal.get(selected) ?? []) : []), [legal, selected]);

  const tryMove = useCallback(
    (from: Square, to: Square) => {
      const ok = legal.get(from)?.some((t) => t.to === to);
      if (ok) {
        onMove?.(from, to);
        setSelected(null);
      }
      return Boolean(ok);
    },
    [legal, onMove],
  );

  /** A tap/click on a square (empty, opponent piece or own piece). */
  const clickSquare = useCallback(
    (sq: Square) => {
      if (!interactive) return;
      if (selected && tryMove(selected, sq)) return;
      if (legal.has(sq)) {
        setSelected((cur) => (cur === sq ? null : sq));
        return;
      }
      setSelected(null);
    },
    [interactive, selected, legal, tryMove],
  );

  return { selected, setSelected, targets, clickSquare, tryMove };
}
