import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";

/** /profile → your own profile page. */
export default async function MyProfile() {
  const supabase = await getServerSupabase();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub as string | undefined;
  if (!id) redirect("/login?next=/profile");
  const { data: p } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle();
  redirect(p ? `/profile/${p.username}` : "/dashboard");
}
