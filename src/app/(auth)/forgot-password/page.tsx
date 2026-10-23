"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { getSupabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { isSupabaseConfigured, siteUrl } from "@/lib/env";
import { Button, Field, Input } from "@/components/ui";
import { AuthCard, FormError } from "@/components/auth/AuthCard";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${siteUrl()}/auth/callback?next=/reset-password`,
    });
    setLoading(false);
    if (error) setError(friendlyError(error));
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title="Check your inbox">
        <div className="flex flex-col items-center py-4 text-center">
          <MailCheck className="h-12 w-12 text-accent" />
          <p className="mt-4 text-[15px] text-muted">
            If an account exists for <span className="font-medium text-text">{email}</span>, a link to reset your password is on its way. It expires in an hour.
          </p>
          <Link href="/login" className="mt-6 text-[14px] font-medium text-accent-2 hover:underline">
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset your password" subtitle="Enter your account's email and we'll send you a reset link." footer={<Link href="/login" className="hover:text-text">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={!isSupabaseConfigured || !/\S+@\S+\.\S+/.test(email)}>
          Send reset link
        </Button>
      </form>
    </AuthCard>
  );
}
