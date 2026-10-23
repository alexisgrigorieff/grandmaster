"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { SendHorizontal } from "lucide-react";
import type { ChatMessage } from "./useGame";
import type { PublicProfile } from "@/lib/chess/types";

const QUICK = ["Good luck!", "Have fun!", "Nice move", "Good game", "Thanks!"];

export function ChatPanel({ messages, me, players, onSend, className }: { messages: ChatMessage[]; me: string | null; players: Record<string, PublicProfile | null>; onSend: (b: string) => Promise<boolean>; className?: string }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send(body: string) {
    if (!body.trim() || sending) return;
    setSending(true);
    const ok = await onSend(body);
    setSending(false);
    if (ok) setText("");
  }

  return (
    <div className={clsx("flex min-h-0 flex-col", className)} data-testid="chat">
      <div ref={box} className="scroll-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-2">
        {messages.length === 0 ? (
          <div className="flex flex-wrap justify-center gap-1.5 py-3">
            {QUICK.slice(0, 2).map((q) => (
              <button key={q} onClick={() => send(q)} className="rounded-full bg-white/[0.05] px-3 py-1 text-[12px] text-muted hover:bg-white/[0.09] hover:text-text">
                {q}
              </button>
            ))}
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === me;
            return (
              <div key={m.id} className={clsx("flex", mine ? "justify-end" : "justify-start")}>
                <div className={clsx("max-w-[85%] rounded-[12px] px-3 py-1.5 text-[13px] leading-snug", mine ? "bg-accent/15 text-text" : "bg-white/[0.05] text-text")}>
                  {!mine && <span className="mr-1.5 text-[11px] font-semibold text-muted">{players[m.user_id]?.display_name ?? ""}</span>}
                  {m.body}
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        className="flex items-center gap-2 border-t border-line p-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="Say something nice…"
          className="h-9 min-w-0 flex-1 rounded-[10px] bg-bg-2 px-3 text-[13px] text-text placeholder:text-faint ring-1 ring-inset ring-line focus:outline-none focus:ring-accent/60"
          aria-label="Chat message"
          data-testid="chat-input"
        />
        <button type="submit" disabled={!text.trim() || sending} className="flex h-9 w-9 items-center justify-center rounded-[10px] text-accent-2 transition hover:bg-accent/10 disabled:opacity-30" aria-label="Send">
          <SendHorizontal className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
