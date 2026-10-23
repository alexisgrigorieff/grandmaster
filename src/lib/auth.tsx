"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { sanitizeSettings, settingsSnapshot, useSettings } from "@/lib/settings";
import { PROFILE_COLUMNS, type Profile } from "@/lib/chess/types";

interface AuthState {
  userId: string | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  userId: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
});


export function AuthProvider({
  initialUserId,
  initialProfile,
  children,
}: {
  initialUserId: string | null;
  initialProfile: Profile | null;
  children: ReactNode;
}) {
  const [userId, setUserId] = useState<string | null>(initialUserId);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [loading, setLoading] = useState(initialUserId ? !initialProfile : false);
  const router = useRouter();
  const replaceSettings = useSettings((s) => s.replace);
  const syncedFor = useRef<string | null>(null);

  const loadProfile = useCallback(async (id: string | null) => {
    if (!id) {
      setProfile(null);
      return;
    }
    const sb = getSupabase();
    const [{ data }, { data: prefs }] = await Promise.all([sb.from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle(), sb.rpc("my_preferences")]);
    setProfile(data ? ({ ...(data as Profile), preferences: (prefs as Record<string, unknown> | null) ?? {} }) : null);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const id = data.session?.user.id ?? null;
      setUserId(id);
      if (id && (!initialProfile || initialProfile.id !== id)) void loadProfile(id).finally(() => setLoading(false));
      else setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const id = session?.user.id ?? null;
      setUserId((prev) => {
        if (prev !== id) {
          void loadProfile(id);
          // Let server components (layout, proxy) see the new session.
          if (event === "SIGNED_IN") router.refresh();
        }
        return id;
      });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Settings sync: profile preferences win once per sign-in; later changes are saved back.
  useEffect(() => {
    if (!profile || syncedFor.current === profile.id) return;
    syncedFor.current = profile.id;
    const prefs = sanitizeSettings(profile.preferences);
    if (Object.keys(prefs).length) replaceSettings(prefs);
  }, [profile, replaceSettings]);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useSettings.subscribe((s, prev) => {
      if (JSON.stringify(settingsSnapshot(s)) === JSON.stringify(settingsSnapshot(prev))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // Query builders are lazy — .then() is what actually sends the request.
        void getSupabase().from("profiles").update({ preferences: settingsSnapshot(useSettings.getState()) }).eq("id", userId).then(() => {});
      }, 1200);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [userId]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    // Full reload: drops every realtime channel and cached page cleanly.
    window.location.assign("/");
  }, []);

  const value = useMemo<AuthState>(
    () => ({ userId, profile, loading, refreshProfile: () => loadProfile(userId), signOut }),
    [userId, profile, loading, loadProfile, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
