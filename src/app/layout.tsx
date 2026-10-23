import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { isSupabaseConfigured } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { PROFILE_COLUMNS, type Profile } from "@/lib/chess/types";

export const metadata: Metadata = {
  title: { default: "Grandmaster — real-time chess in 3D", template: "%s · Grandmaster" },
  description: "Play chess with friends in real time on a beautiful 3D board. Live lobby, challenges, quick play, clocks and game history.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

async function initialSession(): Promise<{ userId: string | null; profile: Profile | null }> {
  if (!isSupabaseConfigured) return { userId: null, profile: null };
  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase.auth.getClaims();
    const userId = (data?.claims?.sub as string | undefined) ?? null;
    if (!userId) return { userId: null, profile: null };
    const [{ data: profile }, { data: prefs }] = await Promise.all([
      supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle(),
      supabase.rpc("my_preferences"),
    ]);
    return { userId, profile: profile ? ({ ...(profile as Profile), preferences: (prefs as Record<string, unknown> | null) ?? {} }) : null };
  } catch {
    return { userId: null, profile: null };
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { userId, profile } = await initialSession();
  return (
    <html lang="en">
      <body className="app-bg min-h-dvh text-text">
        <Providers initialUserId={userId} initialProfile={profile}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
