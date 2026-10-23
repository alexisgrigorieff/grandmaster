import { isSupabaseConfigured } from "@/lib/env";

/** Shown instead of pretending: accounts and multiplayer need a configured backend. */
export function SetupNotice() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="mb-5 rounded-[14px] border border-warn/30 bg-warn/10 p-4 text-[13px] leading-relaxed text-[#f1d39b]">
      <p className="font-semibold text-warn">Backend not configured</p>
      <p className="mt-1">
        Accounts, the lobby and online games need a Supabase project. Set <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
        <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> and <code className="rounded bg-black/30 px-1">SUPABASE_SERVICE_ROLE_KEY</code> — see
        the README.
      </p>
    </div>
  );
}
