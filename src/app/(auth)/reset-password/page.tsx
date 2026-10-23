"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { Button, Field, Input, Spinner } from "@/components/ui";
import { AuthCard, FormError } from "@/components/auth/AuthCard";
import { toast } from "@/components/ui/Toaster";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSupabase()
      .auth.getSession()
      .then(({ data }) => setHasSession(Boolean(data.session)));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await getSupabase().auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError(friendlyError(error));
      return;
    }
    toast("Password updated", { tone: "ok" });
    router.replace("/dashboard");
    router.refresh();
  }

  if (hasSession === null) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-6 w-6 text-faint" />
      </div>
    );
  }

  if (!hasSession) {
    return (
      <AuthCard title="Link expired" subtitle="This reset link is invalid or has already been used.">
        <Link href="/forgot-password">
          <Button variant="primary" size="lg" className="w-full">
            Send a new link
          </Button>
        </Link>
      </AuthCard>
    );
  }

  const mismatch = confirm && confirm !== password;
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="New password" htmlFor="password" error={password && password.length < 8 ? "Use at least 8 characters." : null}>
          <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" error={mismatch ? "Passwords don't match." : null}>
          <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={password.length < 8 || password !== confirm}>
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
