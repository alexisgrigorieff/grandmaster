import { NextResponse, type NextRequest } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Email links (sign-up confirmation, password recovery) land here with a PKCE
 * `code`, which is exchanged for a session cookie.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  if (code) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  const desc = url.searchParams.get("error_description") ?? "That link is invalid or has expired. Please try again.";
  const to = new URL(next === "/reset-password" ? "/forgot-password" : "/login", url.origin);
  to.searchParams.set("error", desc);
  return NextResponse.redirect(to);
}
