import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Token-hash email links (recommended email template, works across devices):
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const nextParam = url.searchParams.get("next") ?? (type === "recovery" ? "/reset-password" : "/dashboard");
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  if (tokenHash && type) {
    const supabase = await getServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  const to = new URL(type === "recovery" ? "/forgot-password" : "/login", url.origin);
  to.searchParams.set("error", "That link is invalid or has expired. Please try again.");
  return NextResponse.redirect(to);
}
