import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

let admin: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — only ever used on the server, after the
 * caller has been authenticated and authorised in code.
 */
export function getAdminSupabase(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) {
    throw new Error("Server is missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).");
  }
  if (!admin) {
    admin = createClient(SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 1 } },
    });
  }
  return admin;
}
