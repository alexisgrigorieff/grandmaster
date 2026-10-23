"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, MailCheck, XCircle } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { isSupabaseConfigured, siteUrl } from "@/lib/env";
import { Button, Field, Input, Spinner } from "@/components/ui";
import { AuthCard, FormError } from "@/components/auth/AuthCard";

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/dashboard";
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const usernameValid = USERNAME_RE.test(username);

  useEffect(() => {
    setAvailable(null);
    if (!usernameValid || !isSupabaseConfigured) return;
    setChecking(true);
    const t = setTimeout(async () => {
      const { data } = await getSupabase().rpc("username_available", { p_username: username });
      setAvailable(Boolean(data));
      setChecking(false);
    }, 350);
    return () => {
      clearTimeout(t);
      setChecking(false);
    };
  }, [username, usernameValid]);

  const passwordError = password && password.length < 8 ? "Use at least 8 characters." : null;
  const confirmError = confirm && confirm !== password ? "Passwords don't match." : null;
  const canSubmit = isSupabaseConfigured && /\S+@\S+\.\S+/.test(email) && usernameValid && available !== false && password.length >= 8 && confirm === password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    const { data, error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username, display_name: username },
        emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);
    if (error) {
      setError(friendlyError(error));
      if (/taken|Database error/i.test(error.message)) setAvailable(false);
      return;
    }
    if (data.session) {
      router.replace(next);
      router.refresh();
    } else {
      // Email confirmation is enabled for this project.
      setSentTo(email.trim());
    }
  }

  if (sentTo) {
    return (
      <AuthCard title="Check your inbox">
        <div className="flex flex-col items-center py-4 text-center">
          <MailCheck className="h-12 w-12 text-accent" />
          <p className="mt-4 text-[15px] text-muted">
            We sent a confirmation link to <span className="font-medium text-text">{sentTo}</span>. Open it on this device to finish creating your account.
          </p>
          <Link href="/login" className="mt-6 text-[14px] font-medium text-accent-2 hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Pick a username — it's how other players will find you."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent-2 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field
          label="Username"
          htmlFor="username"
          error={username && !usernameValid ? "3–20 letters, numbers or underscores." : available === false ? "That username is taken." : null}
          hint="Visible to everyone. Your email stays private."
        >
          <div className="relative">
            <Input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value.trim())} placeholder="magnus_fan" invalid={Boolean(username && (!usernameValid || available === false))} maxLength={20} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {checking ? <Spinner className="h-4 w-4 text-faint" /> : available === true ? <CheckCircle2 className="h-4 w-4 text-ok" /> : available === false ? <XCircle className="h-4 w-4 text-bad" /> : null}
            </span>
          </div>
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password" htmlFor="password" error={passwordError}>
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" invalid={Boolean(passwordError)} />
        </Field>
        <Field label="Confirm password" htmlFor="confirm" error={confirmError}>
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} invalid={Boolean(confirmError)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={!canSubmit}>
          Create account
        </Button>
      </form>
    </AuthCard>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
