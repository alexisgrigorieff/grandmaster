"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/env";

let client: SupabaseClient | null = null;

/** Browser Supabase client (singleton). Uses the public anon/publishable key; RLS protects all data. */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

/**
 * Make sure Realtime will join channels with the signed-in user's JWT (not the
 * anon key). Without this a channel joined during page load can race the
 * session restore and end up subscribed as `anon`, which RLS then filters out.
 */
export async function ensureRealtimeAuth(): Promise<void> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  await supabase.realtime.setAuth(data.session?.access_token ?? null).catch(() => {});
}
