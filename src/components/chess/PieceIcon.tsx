import type { PieceSymbol } from "chess.js";

/**
 * Original flat piece set (drawn for this project) used by the 2D board,
 * captured-piece trays and the promotion picker.
 */
const PATHS: Record<PieceSymbol, { body: string; detail?: string }> = {
  p: {
    body: "M22.5 7.5a5.5 5.5 0 0 0-3.6 9.66C16.6 18.4 15 20.3 15 22.2h3.1c-.5 4.3-2.6 8.2-6.1 10.9V36h21v-2.9c-3.5-2.7-5.6-6.6-6.1-10.9H30c0-1.9-1.6-3.8-3.9-5.04A5.5 5.5 0 0 0 22.5 7.5ZM10 37.2h25v3.3H10z",
  },
  r: {
    body: "M11 7.5h4.2v3.6h3.5V7.5h7.6v3.6h3.5V7.5H34v7.2l-3.6 3.1H14.6L11 14.7ZM15 19.4h15l1.2 12.7H13.8ZM12 33.4h21v3H12ZM9.5 37.3h26v3.2h-26Z",
    detail: "M14.6 17.8h15.8",
  },
  n: {
    body: "M14.2 36.4c-.2-5.3 1.8-8.4 5-11.3 1.3-1.2 1.5-2.6.6-3.5-1.9 1.4-4.4 1.9-6.4 1.7-2.1-.2-3.6-1.9-3-4 .3-1.2 1.4-2.3 2.6-3.6l4.2-4.6c.8-.9 1.2-2 1.4-3.2l.4-2.4 2.6 2.6c6.9.6 12.6 6.5 12.4 15.8-.1 5-1.4 9.7-2.6 12.5ZM10 37.4h25v3.1H10Z",
    detail: "M18.6 13.2a1.3 1.3 0 1 0 .01 0M12.6 19.6l1.7-.9",
  },
  b: {
    body: "M22.5 5a2.6 2.6 0 0 0-1.3 4.9c-4.6 2.6-7.4 7.4-7.4 11.2 0 3.2 1.8 5.3 4.3 6.4l-.9 3.6h10.6l-.9-3.6c2.5-1.1 4.3-3.2 4.3-6.4 0-3.8-2.8-8.6-7.4-11.2A2.6 2.6 0 0 0 22.5 5ZM13.4 32.4h18.2v3.2H13.4ZM9 37h27v3.5H9Z",
    detail: "M25.4 13.6l-4.6 6.6M20 21.3h5",
  },
  q: {
    body: "M9.3 12.4a2.4 2.4 0 1 1 2.6 2.4l3.4 9.8 2.6-12a2.4 2.4 0 1 1 3.1-.2L22.5 23l1.5-10.6a2.4 2.4 0 1 1 3.1.2l2.6 12 3.4-9.8a2.4 2.4 0 1 1 2.6-2.4 2.4 2.4 0 0 1-1.6 2.3L31.2 30H13.8L10.9 14.7a2.4 2.4 0 0 1-1.6-2.3ZM13.4 31.4h18.2v3.4H13.4ZM9.5 36.4h26v4.1h-26Z",
  },
  k: {
    body: "M21.2 4.5h2.6v3.2H27v2.6h-3.2v3.4c5.7.6 9.7 4.1 9.7 8.4 0 3.5-2.2 6.4-3.9 8.8H15.4c-1.7-2.4-3.9-5.3-3.9-8.8 0-4.3 4-7.8 9.7-8.4v-3.4H18V7.7h3.2ZM13.4 32h18.2v3.3H13.4ZM9.5 36.6h26v3.9h-26Z",
    detail: "M15 22.2c4.6-1.9 10.4-1.9 15 0",
  },
};

export function PieceIcon({
  type,
  color,
  className,
  title,
}: {
  type: PieceSymbol;
  color: "w" | "b";
  className?: string;
  title?: string;
}) {
  const { body, detail } = PATHS[type];
  const fill = color === "w" ? "url(#gm-ivory)" : "url(#gm-ebony)";
  const stroke = color === "w" ? "#2a2016" : "#050505";
  const line = color === "w" ? "#6b5640" : "#c7b18a";
  return (
    <svg viewBox="0 0 45 45" className={className} role="img" aria-label={title ?? `${color === "w" ? "White" : "Black"} ${NAMES[type]}`}>
      <path d={body} fill={fill} stroke={stroke} strokeWidth={1.3} strokeLinejoin="round" />
      {detail && <path d={detail} fill="none" stroke={line} strokeWidth={1.2} strokeLinecap="round" />}
    </svg>
  );
}

export const NAMES: Record<PieceSymbol, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

/** Shared gradients for the piece set; render once near the root. */
export function PieceGradients() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        <linearGradient id="gm-ivory" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFF9EE" />
          <stop offset="1" stopColor="#E3D3B6" />
        </linearGradient>
        <linearGradient id="gm-ebony" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4A4A52" />
          <stop offset="1" stopColor="#141417" />
        </linearGradient>
      </defs>
    </svg>
  );
}
