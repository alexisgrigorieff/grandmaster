"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Square } from "chess.js";
import { useShallow } from "zustand/react/shallow";
import clsx from "clsx";
import { animationMs, useSettings } from "@/lib/settings";
import { coordsToSquare, squareToCoords, type TrackedPiece } from "@/lib/chess/pieces";
import { PieceIcon } from "@/components/chess/PieceIcon";
import type { BoardProps } from "@/components/board/types";
import { useSelection } from "@/components/board/useSelection";

const THEMES = {
  wood: { light: "#E6CFA4", dark: "#8B5A35", coordLight: "#8B5A35", coordDark: "#E6CFA4" },
  modern: { light: "#D9D6CE", dark: "#4A4F58", coordLight: "#4A4F58", coordDark: "#D9D6CE" },
};

/** Traditional flat board: fast, accessible, works everywhere. */
export default function Board2D(props: BoardProps) {
  const { pieces, orientation, legal, interactive, onMove, lastMove, check } = props;
  const s = useSettings(useShallow((st) => ({ style: st.pieceStyle, anim: st.animationSpeed, showLegal: st.showLegalMoves, coords: st.showCoordinates, drag: st.dragToMove })));
  const theme = THEMES[s.style];
  const { selected, setSelected, targets, clickSquare, tryMove } = useSelection(legal, interactive, onMove);
  const boardRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; from: Square; x: number; y: number } | null>(null);
  const press = useRef<{ piece: TrackedPiece; x: number; y: number; dragging: boolean } | null>(null);
  const flipped = orientation === "black";
  const ms = animationMs(s.anim);

  const toXY = (sq: Square) => {
    const { file, rank } = squareToCoords(sq);
    return flipped ? { x: 7 - file, y: rank } : { x: file, y: 7 - rank };
  };

  const squareAt = useCallback(
    (clientX: number, clientY: number): Square | null => {
      const r = boardRef.current?.getBoundingClientRect();
      if (!r) return null;
      const x = Math.floor(((clientX - r.left) / r.width) * 8);
      const y = Math.floor(((clientY - r.top) / r.height) * 8);
      if (x < 0 || x > 7 || y < 0 || y > 7) return null;
      return flipped ? coordsToSquare(7 - x, y) : coordsToSquare(x, 7 - y);
    },
    [flipped],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const pr = press.current;
      if (!pr) return;
      if (!pr.dragging && s.drag && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 5) {
        pr.dragging = true;
        setSelected(pr.piece.square);
      }
      if (pr.dragging) setDrag({ id: pr.piece.id, from: pr.piece.square, x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      const pr = press.current;
      if (!pr) return;
      press.current = null;
      if (pr.dragging) {
        setDrag(null);
        const sq = squareAt(e.clientX, e.clientY);
        if (!sq || sq === pr.piece.square || !tryMove(pr.piece.square, sq)) setSelected(pr.piece.square);
      } else {
        setSelected(selected === pr.piece.square ? null : pr.piece.square);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [squareAt, tryMove, selected, setSelected, s.drag]);

  const rect = boardRef.current?.getBoundingClientRect();

  return (
    <div className={clsx("relative mx-auto aspect-square w-full max-w-full touch-none select-none", props.className)} data-testid="board-2d">
      <div
        ref={boardRef}
        className="absolute inset-0 overflow-hidden rounded-[10px] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] ring-1 ring-black/40"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const sq = squareAt(e.clientX, e.clientY);
          if (!sq) return;
          const own = pieces.find((p) => p.square === sq);
          if (own && interactive && legal.has(sq)) {
            press.current = { piece: own, x: e.clientX, y: e.clientY, dragging: false };
            e.preventDefault();
            return;
          }
          clickSquare(sq);
        }}
      >
        {/* Squares */}
        <div className="grid h-full w-full grid-cols-8 grid-rows-8">
          {Array.from({ length: 64 }, (_, i) => {
            const x = i % 8;
            const y = Math.floor(i / 8);
            const sq = (flipped ? coordsToSquare(7 - x, y) : coordsToSquare(x, 7 - y))!;
            const { file, rank } = squareToCoords(sq);
            const light = (file + rank) % 2 === 1;
            const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
            const target = targets.find((t) => t.to === sq);
            return (
              <div key={sq} className="relative" style={{ background: light ? theme.light : theme.dark }} data-square={sq}>
                {isLast && <div className="absolute inset-0 bg-[#E8B04A]/40" />}
                {selected === sq && <div className="absolute inset-0 bg-[#F3C764]/55" />}
                {check === sq && <div className="absolute inset-0" style={{ background: "radial-gradient(circle, rgba(235,70,55,0.95) 0%, rgba(235,70,55,0.5) 40%, transparent 72%)" }} />}
                {s.showLegal && target && !target.capture && <div className="absolute left-1/2 top-1/2 h-[28%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/25" />}
                {s.showLegal && target && target.capture && <div className="absolute inset-[4%] rounded-full border-[5px] border-black/25" />}
                {s.coords && y === 7 && (
                  <span className="pointer-events-none absolute bottom-[2px] right-[4px] text-[10px] font-semibold sm:text-xs" style={{ color: light ? theme.coordLight : theme.coordDark }}>
                    {sq[0]}
                  </span>
                )}
                {s.coords && x === 0 && (
                  <span className="pointer-events-none absolute left-[4px] top-[2px] text-[10px] font-semibold sm:text-xs" style={{ color: light ? theme.coordLight : theme.coordDark }}>
                    {sq[1]}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Pieces */}
        {pieces.map((p) => {
          const { x, y } = toXY(p.square);
          const dragging = drag?.id === p.id && rect;
          const style: React.CSSProperties = dragging
            ? {
                transform: `translate(${drag!.x - rect!.left - rect!.width / 16}px, ${drag!.y - rect!.top - rect!.height / 16}px) scale(1.12)`,
                transition: "none",
                zIndex: 30,
              }
            : {
                transform: `translate(${x * 100}%, ${y * 100}%)`,
                transition: ms ? `transform ${ms}ms cubic-bezier(.4,.1,.2,1)` : undefined,
              };
          return (
            <div
              key={p.id}
              className={clsx("pointer-events-none absolute left-0 top-0 h-[12.5%] w-[12.5%] p-[0.6%]", interactive && legal.has(p.square) && "cursor-grab")}
              style={style}
              data-piece={`${p.color}${p.type}`}
              data-on={p.square}
            >
              <PieceIcon type={p.type} color={p.color} className="h-full w-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
