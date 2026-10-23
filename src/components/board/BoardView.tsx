"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { useSettings } from "@/lib/settings";
import Board2D from "@/components/board2d/Board2D";
import type { BoardProps } from "./types";

const Board3D = dynamic(() => import("@/components/board3d/Board3D"), {
  ssr: false,
  loading: () => <BoardLoading />,
});

function BoardLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-[var(--accent)]" />
    </div>
  );
}

let webglCache: boolean | null = null;
export function hasWebGL(): boolean {
  if (webglCache != null) return webglCache;
  try {
    const c = document.createElement("canvas");
    webglCache = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    webglCache = false;
  }
  return webglCache;
}

class GLBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("3D board failed, falling back to 2D", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Renders the 3D board when enabled and supported, otherwise the 2D board.
 * The 2D board is sized as a square that fits the container.
 */
export function BoardView(props: BoardProps & { forceMode?: "2d" | "3d" }) {
  const mode = useSettings((s) => s.boardMode);
  const [gl, setGl] = useState<boolean | null>(null);
  useEffect(() => setGl(hasWebGL()), []);
  const want = props.forceMode ?? mode;
  const flat = (
    <div className="flex h-full w-full items-center justify-center [container-type:size]">
      <div className="aspect-square w-[min(100cqw,100cqh)]">
        <Board2D {...props} />
      </div>
    </div>
  );
  if (gl === null) return <BoardLoading />;
  if (want === "2d" || !gl) return flat;
  return (
    <GLBoundary fallback={flat}>
      <Board3D {...props} />
    </GLBoundary>
  );
}
