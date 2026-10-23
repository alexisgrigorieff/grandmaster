"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { isSupabaseConfigured } from "@/lib/env";
import { Button, Field, Input } from "@/components/ui";
import { AuthCard, FormError } from "@/components/auth/AuthCard";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(params.get("error"));
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoading(false);
      setError(friendlyError(error));
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to see who's online and pick up your games."
      footer={
        <>
          New here?{" "}
          <Link href={`/register${next !== "/dashboard" ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-accent-2 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </Field>
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-[13px] text-muted hover:text-text">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={!isSupabaseConfigured || !email || !password}>
          Sign in
        </Button>
      </form>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
