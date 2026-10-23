"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Camera, Trash2, Volume2 } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { getSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSettings, type AnimationSpeed, type BoardMode, type PieceStyle, type Quality } from "@/lib/settings";
import { friendlyError } from "@/lib/errors";
import { playSound, unlockAudio } from "@/lib/sound";
import { initialPieces } from "@/lib/chess/pieces";
import { START_FEN } from "@/lib/chess/constants";
import { Page, PageHeader } from "@/components/layout/Page";
import { Avatar, AVATAR_COLORS, AVATAR_PIECES } from "@/components/ui/Avatar";
import { Button, Field, Input, Segmented, Toggle } from "@/components/ui";
import { toast } from "@/components/ui/Toaster";
import { BoardView } from "@/components/board/BoardView";
import { PieceIcon } from "@/components/chess/PieceIcon";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-[16px] font-semibold text-text">{title}</h2>
      {description && <p className="mt-0.5 text-[13px] text-faint">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[15px] text-text">{label}</p>
        {description && <p className="text-[13px] text-faint">{description}</p>}
      </div>
      {children}
    </div>
  );
}

async function resizeToWebp(file: File, size = 256): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const s = Math.min(bmp.width, bmp.height);
  g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not process image"))), "image/webp", 0.88));
}

function ProfileSection() {
  const { profile, userId, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [preset, setPreset] = useState("knight-amber");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setBio(profile.bio ?? "");
    setPreset(profile.avatar_preset);
  }, [profile]);

  const [piece, color] = preset.split("-");
  const dirty = profile && (displayName !== profile.display_name || bio !== (profile.bio ?? "") || preset !== profile.avatar_preset);
  const nameError = displayName.trim().length < 1 ? "Required" : displayName.trim().length > 40 ? "Max 40 characters" : null;

  async function save() {
    if (!userId || nameError) return;
    setSaving(true);
    const { error } = await getSupabase().from("profiles").update({ display_name: displayName.trim(), bio: bio.trim().slice(0, 160), avatar_preset: preset }).eq("id", userId);
    setSaving(false);
    if (error) toast("Couldn't save profile", { body: friendlyError(error), tone: "bad" });
    else {
      toast("Profile saved", { tone: "ok" });
      await refreshProfile();
    }
  }

  async function upload(file: File) {
    if (!userId) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast("Use a PNG, JPEG or WebP image", { tone: "bad" });
      return;
    }
    setUploading(true);
    try {
      const blob = await resizeToWebp(file);
      const path = `${userId}/avatar-${Date.now()}.webp`;
      const sb = getSupabase();
      const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/webp", upsert: true });
      if (error) throw error;
      const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const { error: e2 } = await sb.from("profiles").update({ avatar_url: url }).eq("id", userId);
      if (e2) throw e2;
      await refreshProfile();
      toast("Photo updated", { tone: "ok" });
    } catch (e) {
      toast("Upload failed", { body: friendlyError(e, "Storage may not be configured — see the README."), tone: "bad" });
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    if (!userId) return;
    await getSupabase().from("profiles").update({ avatar_url: null }).eq("id", userId);
    await refreshProfile();
  }

  return (
    <Section title="Profile" description="How other players see you. Your email address is never shown.">
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="flex flex-col items-center gap-3">
          <Avatar user={{ ...profile, avatar_preset: preset }} size="xl" />
          <div className="flex gap-1">
            <Button size="sm" variant="subtle" icon={<Camera className="h-3.5 w-3.5" />} loading={uploading} onClick={() => fileRef.current?.click()}>
              Photo
            </Button>
            {profile?.avatar_url && (
              <Button size="sm" variant="ghost" onClick={removePhoto} aria-label="Remove photo">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        <div className="flex-1 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" htmlFor="dn" error={nameError}>
              <Input id="dn" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Field label="Username" htmlFor="un" hint="Usernames can't be changed.">
              <Input id="un" value={profile?.username ?? ""} disabled className="opacity-60" />
            </Field>
          </div>
          <Field label="Bio" htmlFor="bio" hint={`${bio.length}/160`}>
            <Input id="bio" value={bio} maxLength={160} onChange={(e) => setBio(e.target.value)} placeholder="Favourite opening? Hero? Say hello." />
          </Field>
          <div>
            <p className="mb-2 text-[13px] font-medium text-muted">Avatar {profile?.avatar_url ? "(shown when you have no photo)" : ""}</p>
            <div className="flex flex-wrap gap-1.5">
              {AVATAR_PIECES.map((p) => (
                <button key={p.id} onClick={() => setPreset(`${p.id}-${color}`)} className={clsx("flex h-10 w-10 items-center justify-center rounded-[10px] ring-1 ring-inset", piece === p.id ? "bg-accent/15 ring-accent/60" : "bg-white/[0.03] ring-line hover:bg-white/[0.06]")} aria-label={p.id}>
                  <PieceIcon type={p.type} color="w" className="h-7 w-7" />
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(AVATAR_COLORS).map(([c, [a, b]]) => (
                <button key={c} onClick={() => setPreset(`${piece}-${c}`)} className={clsx("h-8 w-8 rounded-full ring-2 ring-offset-2 ring-offset-[var(--surface)]", color === c ? "ring-accent" : "ring-transparent")} style={{ background: `radial-gradient(120% 120% at 30% 20%, ${a}, ${b})` }} aria-label={c} />
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="primary" onClick={save} loading={saving} disabled={!dirty || Boolean(nameError)} data-testid="save-profile">
              Save profile
            </Button>
          </div>
        </div>
      </div>
    </Section>
  );
}

function AccountSection() {
  const { signOut } = useAuth();
  const [email, setEmail] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void getSupabase()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);
  async function changePassword() {
    setSaving(true);
    const { error } = await getSupabase().auth.updateUser({ password: pw });
    setSaving(false);
    if (error) toast("Couldn't change password", { body: friendlyError(error), tone: "bad" });
    else {
      setPw("");
      toast("Password changed", { tone: "ok" });
    }
  }
  return (
    <Section title="Account">
      <Row label="Email" description="Private — only you can see this.">
        <span className="text-[14px] text-muted">{email ?? "…"}</span>
      </Row>
      <div className="border-b border-line py-3">
        <p className="text-[15px] text-text">Change password</p>
        <div className="mt-2 flex gap-2">
          <Input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
          <Button onClick={changePassword} loading={saving} disabled={pw.length < 8}>
            Update
          </Button>
        </div>
      </div>
      <div className="pt-4">
        <Button variant="danger" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </Section>
  );
}

export default function SettingsPage() {
  const s = useSettings(useShallow((st) => st));
  const pieces = useMemo(() => initialPieces(START_FEN), []);
  return (
    <Page>
      <PageHeader title="Settings" subtitle="Saved to your account, so they follow you to every device." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <ProfileSection />
          <Section title="Board & pieces">
            <Row label="Board" description="2D is lighter on older devices.">
              <Segmented<BoardMode> value={s.boardMode} onChange={(v) => s.set({ boardMode: v })} options={[{ value: "3d", label: "3D" }, { value: "2d", label: "2D" }]} />
            </Row>
            <Row label="Piece style">
              <Segmented<PieceStyle> value={s.pieceStyle} onChange={(v) => s.set({ pieceStyle: v })} options={[{ value: "wood", label: "Classic wood" }, { value: "modern", label: "Modern" }]} />
            </Row>
            <Row label="Graphics quality" description="Shadows, reflections and resolution of the 3D board.">
              <Segmented<Quality> value={s.quality} onChange={(v) => s.set({ quality: v })} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} />
            </Row>
            <Row label="Animation speed">
              <Segmented<AnimationSpeed> value={s.animationSpeed} onChange={(v) => s.set({ animationSpeed: v })} options={[{ value: "off", label: "Off" }, { value: "fast", label: "Fast" }, { value: "normal", label: "Normal" }, { value: "slow", label: "Slow" }]} />
            </Row>
            <Toggle checked={s.showLegalMoves} onChange={(v) => s.set({ showLegalMoves: v })} label="Show legal moves" description="Dots on the squares the selected piece can reach." />
            <Toggle checked={s.showCoordinates} onChange={(v) => s.set({ showCoordinates: v })} label="Show coordinates" />
            <Toggle checked={s.dragToMove} onChange={(v) => s.set({ dragToMove: v })} label="Drag and drop" description="Tap-to-move always works too." />
          </Section>
          <Section title="Sound">
            <Toggle checked={s.sound} onChange={(v) => s.set({ sound: v })} label="Sound effects" />
            <Row label="Volume">
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => s.set({ volume: Number(e.target.value) })} className="w-40" aria-label="Volume" />
                <Button
                  size="sm"
                  variant="subtle"
                  icon={<Volume2 className="h-3.5 w-3.5" />}
                  onClick={() => {
                    unlockAudio();
                    playSound("move");
                    setTimeout(() => playSound("capture"), 300);
                    setTimeout(() => playSound("check"), 650);
                  }}
                >
                  Test
                </Button>
              </div>
            </Row>
          </Section>
          <Section title="Gameplay">
            <Toggle checked={s.autoQueen} onChange={(v) => s.set({ autoQueen: v })} label="Always promote to a queen" description="Skip the promotion picker." />
            <Toggle checked={s.chat} onChange={(v) => s.set({ chat: v })} label="In-game chat" />
          </Section>
          <AccountSection />
        </div>
        <div className="hidden lg:block">
          <div className="card sticky top-24 overflow-hidden">
            <p className="px-4 pt-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">Preview</p>
            <div className="h-[300px]">
              <BoardView pieces={pieces} orientation="white" legal={new Map()} lastMove={{ from: "e2", to: "e4" }} check={null} interactive={false} />
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
