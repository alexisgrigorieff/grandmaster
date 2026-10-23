"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Chess, type Square } from "chess.js";
import { Box, Flag, FlipVertical2, Handshake, MessageSquare, RotateCcw, Square as SquareIcon, Trophy, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useAuth } from "@/lib/auth";
import { usePresence } from "@/lib/realtime/presence";
import { useSettings } from "@/lib/settings";
import { ABANDONMENT_MS, UNTIMED_MOVE_LIMIT_MS, formatTimeControl } from "@/lib/chess/constants";
import { TERMINATION_LABEL, opposite } from "@/lib/chess/rules";
import { materialBalance, trackPieces } from "@/lib/chess/pieces";
import { sideToMove } from "@/lib/chess/clock";
import type { Color, GameRow, PublicProfile } from "@/lib/chess/types";
import { BoardView } from "@/components/board/BoardView";
import { Badge, Button, Dialog, Segmented, Spinner } from "@/components/ui";
import { toast } from "@/components/ui/Toaster";
import { useGame } from "./useGame";
import { getSupabase } from "@/lib/supabase/client";
import { serverNow } from "@/lib/serverTime";
import { PlayerStrip } from "./PlayerStrip";
import { MoveList } from "./MoveList";
import { ChatPanel } from "./ChatPanel";
import { PromotionPicker } from "./PromotionPicker";

function fmtSecs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function outcomeFor(game: GameRow, color: Color | null): "win" | "loss" | "draw" | "aborted" | null {
  if (game.status === "aborted") return "aborted";
  if (game.status !== "finished" || !game.result) return null;
  if (game.result === "1/2-1/2") return "draw";
  if (!color) return null;
  return (game.result === "1-0") === (color === "white") ? "win" : "loss";
}

function resultHeadline(game: GameRow, color: Color | null, players: { white: PublicProfile | null; black: PublicProfile | null }) {
  const o = outcomeFor(game, color);
  if (o === "aborted") return "Game aborted";
  if (o === "draw") return "Draw";
  if (o === "win") return "You won";
  if (o === "loss") return "You lost";
  if (game.result === "1-0") return `${players.white?.display_name ?? "White"} won`;
  if (game.result === "0-1") return `${players.black?.display_name ?? "Black"} won`;
  return "";
}

export function GameRoom({ gameId }: { gameId: string }) {
  const { userId } = useAuth();
  const { statusOf, connected: presenceConnected, refreshActiveGame } = usePresence();
  const router = useRouter();
  const g = useGame(gameId, userId);
  const { game, players, myColor, derived, legal } = g;
  const settings = useSettings(useShallow((s) => ({ boardMode: s.boardMode, autoQueen: s.autoQueen, chat: s.chat, set: s.set })));

  const [flipped, setFlipped] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [mobileTab, setMobileTab] = useState<"moves" | "chat">("moves");
  const [, tick] = useState(0);
  const lastStatus = useRef<string | null>(null);

  const orientation: Color = flipped ? opposite(myColor ?? "white") : (myColor ?? "white");
  const opponentColor: Color = opposite(myColor ?? "white");
  const opponent = game ? players[opponentColor] : null;
  const me = myColor ? players[myColor] : null;

  // Live clock for "disconnected" timers.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Game over → show result once (only if it ended while we were watching).
  useEffect(() => {
    if (!game) return;
    if (lastStatus.current === "active" && game.status !== "active") {
      setShowResult(true);
      void refreshActiveGame();
    }
    lastStatus.current = game.status;
  }, [game, refreshActiveGame]);

  // Rematch accepted by either side → go there.
  useEffect(() => {
    if (game?.rematch_game_id) {
      toast("Rematch!", { body: "Colours have been swapped.", tone: "accent" });
      void refreshActiveGame();
      router.push(`/game/${game.rematch_game_id}`);
    }
  }, [game?.rematch_game_id, router, refreshActiveGame]);

  // Opponent connection tracking.
  const opponentStatus = opponent ? statusOf(opponent.id) : "offline";
  const [goneSince, setGoneSince] = useState<number | null>(null);
  useEffect(() => {
    if (!game || game.status !== "active" || !presenceConnected || !opponent) {
      setGoneSince(null);
      return;
    }
    if (opponentStatus !== "offline") {
      setGoneSince(null);
      return;
    }
    // Use the server's record of their last heartbeat, so the timer matches
    // what the server will accept for an abandonment claim.
    let cancelled = false;
    const check = async () => {
      const { data } = await getSupabase()
        .from("game_presence")
        .select("last_seen_at")
        .eq("game_id", game.id)
        .eq("user_id", opponent.id)
        .maybeSingle();
      if (cancelled) return;
      const last = data?.last_seen_at ? Date.parse(data.last_seen_at) : Date.parse(game.created_at);
      // Convert server time to local time.
      setGoneSince(last - (serverNow() - Date.now()));
    };
    void check();
    const t = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentStatus, presenceConnected, game?.status, game?.id, opponent?.id]);

  const total = derived?.verbose.length ?? 0;
  const shownPly = viewPly == null ? total : Math.min(viewPly, total);
  const isLive = shownPly === total;

  const view = useMemo(() => {
    if (!game || !derived) return null;
    const verbose = derived.verbose.slice(0, shownPly);
    const t = shownPly === total && g.track ? g.track : trackPieces(game.initial_fen, verbose);
    const fen = shownPly === 0 ? game.initial_fen : verbose[shownPly - 1].after;
    const pos = new Chess(fen);
    let check: Square | null = null;
    if (pos.inCheck()) {
      const turn = pos.turn();
      for (const row of pos.board()) for (const p of row) if (p && p.type === "k" && p.color === turn) check = p.square;
    }
    const last = verbose[verbose.length - 1];
    return { track: t, check, lastMove: last ? { from: last.from, to: last.to } : null };
  }, [game, derived, shownPly, total, g.track]);

  const onMove = useCallback(
    (from: Square, to: Square) => {
      const target = legal.get(from)?.find((t) => t.to === to);
      if (!target) return;
      if (target.promotion) {
        if (settings.autoQueen) void g.move(from, to, "q");
        else setPromo({ from, to });
        return;
      }
      void g.move(from, to);
    },
    [legal, settings.autoQueen, g],
  );

  const selectPly = useCallback((p: number) => setViewPly(p >= total ? null : p), [total]);

  if (g.load === "loading" || (!game && g.load !== "not_found" && g.load !== "error")) {
    return (
      <div className="flex h-[70dvh] items-center justify-center">
        <Spinner className="h-7 w-7 text-faint" />
      </div>
    );
  }
  if (!game || g.load === "not_found") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
        <h1 className="font-display text-3xl">Game not found</h1>
        <p className="mt-2 text-muted">This game doesn&apos;t exist, or it belongs to other players.</p>
        <Link href="/lobby" className="mt-6">
          <Button variant="primary">Go to the lobby</Button>
        </Link>
      </div>
    );
  }

  const active = game.status === "active";
  const myTurn = active && myColor != null && sideToMove(game) === myColor && !g.pending;
  const outcome = outcomeFor(game, myColor);
  const drawOfferedToMe = active && game.draw_offer_by != null && game.draw_offer_by !== userId;
  const drawOfferedByMe = active && game.draw_offer_by === userId;
  const rematchOfferedToMe = !active && game.rematch_offer_by != null && game.rematch_offer_by !== userId && !game.rematch_game_id;
  const rematchOfferedByMe = !active && game.rematch_offer_by === userId && !game.rematch_game_id;
  const goneFor = goneSince ? Date.now() - goneSince : 0;
  const timed = game.initial_ms != null;
  const opponentToMove = sideToMove(game) === opponentColor;
  const stalled = active && !timed && opponentToMove && game.turn_started_at != null && serverNow() - Date.parse(game.turn_started_at) >= UNTIMED_MOVE_LIMIT_MS;
  const canClaimWin = active && (game.ply < 2 || opponentToMove) && ((goneSince != null && goneFor >= ABANDONMENT_MS) || stalled);
  const balance = view ? materialBalance(view.track) : 0;

  const strip = (color: Color) => {
    const p = players[color];
    const isMine = color === myColor;
    const status = p ? (isMine ? "playing" : statusOf(p.id)) : "offline";
    const note =
      !isMine && active && goneSince
        ? canClaimWin
          ? "Disconnected — you can claim the win"
          : `Disconnected · ${fmtSecs(goneFor)}`
        : null;
    return (
      <PlayerStrip
        game={game}
        player={p}
        color={color}
        mine={isMine}
        status={status}
        capturedFromOpponent={view ? view.track.captured[color === "white" ? "b" : "w"] : []}
        advantage={color === "white" ? balance : -balance}
        toMove={sideToMove(game) === color}
        connectionNote={note}
      />
    );
  };

  let statusText: React.ReactNode;
  if (!active) {
    statusText = (
      <>
        <span className="font-semibold text-text">{resultHeadline(game, myColor, players)}</span>
        {game.termination && <span className="text-muted"> · {TERMINATION_LABEL[game.termination]}</span>}
      </>
    );
  } else if (g.pending) {
    statusText = <span className="text-muted">Sending move…</span>;
  } else if (view?.check && isLive) {
    statusText = <span className="font-semibold text-bad">{myTurn ? "You're in check" : "Check!"}</span>;
  } else if (myTurn) {
    statusText = <span className="font-semibold text-accent-2">Your move</span>;
  } else if (myColor) {
    statusText = <span className="text-muted">Waiting for {opponent?.display_name ?? "opponent"}…</span>;
  }

  const controls = (
    <div className="flex flex-wrap gap-2" data-testid="game-controls">
      {active ? (
        <>
          {game.ply < 2 ? (
            <Button size="sm" variant="subtle" icon={<X className="h-4 w-4" />} onClick={() => g.action("abort")} loading={g.busyAction === "abort"} data-testid="abort">
              Abort
            </Button>
          ) : (
            <>
              {drawOfferedToMe ? null : (
                <Button size="sm" variant="subtle" icon={<Handshake className="h-4 w-4" />} disabled={drawOfferedByMe} onClick={() => g.action("offer_draw")} loading={g.busyAction === "offer_draw"} data-testid="offer-draw">
                  {drawOfferedByMe ? "Draw offered" : "Offer draw"}
                </Button>
              )}
              <Button size="sm" variant="danger" icon={<Flag className="h-4 w-4" />} onClick={() => setConfirmResign(true)} data-testid="resign">
                Resign
              </Button>
            </>
          )}
          {g.canClaimDraw && (
            <Button size="sm" variant="primary" onClick={() => g.action("claim_draw")} loading={g.busyAction === "claim_draw"} data-testid="claim-draw">
              Claim draw
            </Button>
          )}
          {canClaimWin && (
            <Button size="sm" variant="primary" icon={<Trophy className="h-4 w-4" />} onClick={() => g.action("claim_abandonment")} loading={g.busyAction === "claim_abandonment"} data-testid="claim-win">
              {game.ply < 2 ? "Abort game" : "Claim victory"}
            </Button>
          )}
        </>
      ) : (
        <>
          {rematchOfferedToMe ? (
            <>
              <Button size="sm" variant="primary" onClick={() => g.action("accept_rematch")} loading={g.busyAction === "accept_rematch"} data-testid="accept-rematch">
                Accept rematch
              </Button>
              <Button size="sm" variant="subtle" onClick={() => g.action("decline_rematch")}>
                Decline
              </Button>
            </>
          ) : rematchOfferedByMe ? (
            <Button size="sm" variant="subtle" onClick={() => g.action("cancel_rematch")} data-testid="cancel-rematch">
              Rematch offered · Cancel
            </Button>
          ) : (
            myColor && (
              <Button size="sm" variant="primary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => g.action("offer_rematch")} loading={g.busyAction === "offer_rematch"} data-testid="offer-rematch">
                Rematch
              </Button>
            )
          )}
          <Link href="/lobby">
            <Button size="sm" variant="subtle">
              New opponent
            </Button>
          </Link>
        </>
      )}
    </div>
  );

  const drawBanner = drawOfferedToMe && (
    <div className="flex items-center gap-3 rounded-[14px] bg-accent/10 p-3 ring-1 ring-inset ring-accent/30" data-testid="draw-offer">
      <Handshake className="h-5 w-5 shrink-0 text-accent-2" />
      <p className="flex-1 text-[14px] text-text">{opponent?.display_name ?? "Your opponent"} offers a draw</p>
      <Button size="sm" variant="primary" onClick={() => g.action("accept_draw")} loading={g.busyAction === "accept_draw"} data-testid="accept-draw">
        Accept
      </Button>
      <Button size="sm" variant="ghost" onClick={() => g.action("decline_draw")}>
        Decline
      </Button>
    </div>
  );

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-3 px-2 pb-6 pt-2 sm:px-4 lg:h-[calc(100dvh-4rem)] lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5 lg:py-4" data-testid="game-room" data-status={game.status} data-ply={game.ply}>
      {/* Board column */}
      <div className="flex min-h-0 flex-col gap-1.5">
        {strip(orientation === "white" ? "black" : "white")}
        <div className="relative isolate h-[min(100vw,68dvh)] min-h-[300px] overflow-hidden rounded-[20px] bg-[radial-gradient(90%_70%_at_50%_45%,#1b1813_0%,#0e0d0c_60%,#0a0a0b_100%)] ring-1 ring-line sm:h-[min(78vw,72dvh)] lg:h-auto lg:flex-1">
          {view && (
            <BoardView
              pieces={view.track.pieces}
              orientation={orientation}
              legal={isLive ? legal : new Map()}
              lastMove={view.lastMove}
              check={view.check}
              interactive={isLive && legal.size > 0}
              onMove={onMove}
              cameraResetKey={cameraKey}
            />
          )}
          {/* Board toolbar */}
          <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-[12px] bg-black/40 p-1 ring-1 ring-white/10 backdrop-blur-md">
            <Segmented
              size="sm"
              value={settings.boardMode}
              onChange={(v) => settings.set({ boardMode: v })}
              options={[
                { value: "3d", label: <Box className="h-3.5 w-3.5" />, title: "3D board" },
                { value: "2d", label: <SquareIcon className="h-3.5 w-3.5" />, title: "2D board" },
              ]}
              className="!bg-transparent !p-0 !ring-0"
            />
            <button className="flex h-7 w-7 items-center justify-center rounded-[8px] text-muted hover:bg-white/10 hover:text-text" onClick={() => setFlipped((f) => !f)} title="Flip board" aria-label="Flip board" data-testid="flip-board">
              <FlipVertical2 className="h-4 w-4" />
            </button>
            {settings.boardMode === "3d" && (
              <button className="flex h-7 w-7 items-center justify-center rounded-[8px] text-muted hover:bg-white/10 hover:text-text" onClick={() => setCameraKey((k) => k + 1)} title="Reset camera" aria-label="Reset camera">
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </div>
          {!isLive && (
            <button onClick={() => setViewPly(null)} className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-accent px-4 py-1.5 text-[13px] font-semibold text-accent-ink shadow-lg">
              {active ? "Back to live position" : "Jump to final position"}
            </button>
          )}
          {!g.live && active && (
            <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-warn ring-1 ring-warn/30">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-warn" /> Reconnecting…
            </div>
          )}
          {promo && myColor && (
            <PromotionPicker
              color={myColor === "white" ? "w" : "b"}
              onCancel={() => setPromo(null)}
              onPick={(p) => {
                const { from, to } = promo;
                setPromo(null);
                void g.move(from, to, p);
              }}
            />
          )}
        </div>
        {strip(orientation)}
      </div>

      {/* Sidebar */}
      <aside className="flex min-h-0 flex-col gap-3">
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[12px] text-faint">
              <Badge>{formatTimeControl(game.initial_ms, game.increment_ms)}</Badge>
              <Badge tone={game.rated ? "accent" : "neutral"}>{game.rated ? "Rated" : "Casual"}</Badge>
            </div>
            {active && timed && game.ply < 2 && <span className="text-[11px] text-faint">Clock starts after move 1</span>}
          </div>
          <p className="mt-3 text-[15px]" data-testid="game-status">
            {statusText}
          </p>
          {!active && outcome !== "aborted" && myColor && (
            <p className="mt-1 text-[13px] text-faint">
              {game.rated ? "Rating updated." : "Casual game — ratings unchanged."} Use the move list to replay the game.
            </p>
          )}
          <div className="mt-4 space-y-3">
            {drawBanner}
            {rematchOfferedToMe && (
              <p className="text-[13px] text-accent-2" data-testid="rematch-offer">
                {opponent?.display_name} wants a rematch.
              </p>
            )}
            {controls}
          </div>
        </div>

        {/* Desktop: moves + chat stacked. Mobile: tabs. */}
        <div className="card flex min-h-[300px] flex-1 flex-col overflow-hidden lg:min-h-0">
          <div className="flex border-b border-line lg:hidden">
            {(["moves", "chat"] as const).map((t) => (
              <button key={t} onClick={() => setMobileTab(t)} className={clsx("flex-1 py-2.5 text-[13px] font-medium capitalize", mobileTab === t ? "text-text shadow-[inset_0_-2px_0_var(--accent)]" : "text-faint")}>
                {t === "chat" && g.messages.length > 0 ? `Chat (${g.messages.length})` : t}
              </button>
            ))}
          </div>
          <div className={clsx("min-h-0 flex-1 flex-col", mobileTab === "moves" ? "flex" : "hidden", "lg:flex")}>
            <p className="hidden border-b border-line px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-faint lg:block">Moves</p>
            <MoveList moves={derived?.verbose ?? []} viewPly={shownPly} onSelect={selectPly} className="min-h-0 flex-1" />
          </div>
          {settings.chat ? (
            <div className={clsx("min-h-0 shrink-0 flex-col lg:h-[42%] lg:min-h-[150px] lg:border-t lg:border-line", mobileTab === "chat" ? "flex h-[260px]" : "hidden", "lg:flex")}>
              <p className="hidden items-center gap-2 px-4 pt-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-faint lg:flex">
                <MessageSquare className="h-3.5 w-3.5" /> Chat
              </p>
              <ChatPanel messages={g.messages} me={userId} players={{ [game.white_id]: players.white, [game.black_id]: players.black }} onSend={g.sendChat} className="flex-1" />
            </div>
          ) : (
            mobileTab === "chat" && <p className="p-4 text-[13px] text-faint lg:hidden">Chat is turned off in settings.</p>
          )}
        </div>
      </aside>

      <Dialog
        open={confirmResign}
        onClose={() => setConfirmResign(false)}
        size="sm"
        title="Resign this game?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmResign(false)}>
              Keep playing
            </Button>
            <Button
              variant="danger"
              data-testid="confirm-resign"
              loading={g.busyAction === "resign"}
              onClick={async () => {
                await g.action("resign");
                setConfirmResign(false);
              }}
            >
              Resign
            </Button>
          </>
        }
      >
        {opponent?.display_name ?? "Your opponent"} will be awarded the win{game.rated ? " and rating points" : ""}.
      </Dialog>

      <Dialog
        open={showResult}
        onClose={() => setShowResult(false)}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowResult(false)} data-testid="review-game">
              Review game
            </Button>
            {myColor && !game.rematch_game_id && game.status === "finished" && !rematchOfferedByMe && (
              <Button
                variant="primary"
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={() => {
                  void g.action(rematchOfferedToMe ? "accept_rematch" : "offer_rematch");
                  setShowResult(false);
                }}
              >
                {rematchOfferedToMe ? "Accept rematch" : "Rematch"}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col items-center pb-2 pt-3 text-center" data-testid="result-dialog">
          <div
            className={clsx(
              "flex h-16 w-16 items-center justify-center rounded-full",
              outcome === "win" ? "bg-accent/15 text-accent-2" : outcome === "loss" ? "bg-bad/15 text-bad" : "bg-white/[0.06] text-muted",
            )}
          >
            {outcome === "win" ? <Trophy className="h-8 w-8" /> : outcome === "loss" ? <Flag className="h-7 w-7" /> : <Handshake className="h-7 w-7" />}
          </div>
          <h2 className="font-display mt-4 text-[30px] text-text">{resultHeadline(game, myColor, players)}</h2>
          <p className="mt-1 text-[14px] text-muted">{game.termination ? TERMINATION_LABEL[game.termination] : ""}</p>
          {myColor && game.rated && game.status === "finished" && (
            <p className="mt-3 text-[14px] text-muted">
              Rating{" "}
              <span className="tabular font-semibold text-text">{me?.rating}</span>{" "}
              {(() => {
                const d = myColor === "white" ? game.white_rating_diff : game.black_rating_diff;
                if (d == null) return null;
                return <span className={clsx("tabular font-semibold", d > 0 ? "text-ok" : d < 0 ? "text-bad" : "text-faint")}>({d > 0 ? `+${d}` : d})</span>;
              })()}
            </p>
          )}
        </div>
      </Dialog>
    </div>
  );
}

