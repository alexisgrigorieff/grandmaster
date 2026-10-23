import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * Returns the authenticated user's id, verified with Supabase Auth.
 * Accepts the session cookie (browsers) or an `Authorization: Bearer <jwt>`
 * header (scripts / tests).
 */
export async function authenticate(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const token = header.slice(7).trim();
    const { data, error } = await getAdminSupabase().auth.getUser(token);
    return error ? null : (data.user?.id ?? null);
  }
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : (data.user?.id ?? null);
}
