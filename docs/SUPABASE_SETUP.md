# Setting up Supabase

Grandmaster uses one free Supabase project for authentication, the Postgres
database, Realtime (presence and live game updates) and Storage (avatar photos).
This takes about ten minutes.

## 1. Create the project

1. Sign in at [supabase.com](https://supabase.com) and click **New project**.
2. Pick a name (e.g. `grandmaster`), a strong database password, and the region
   closest to you and your friends. The **Free** plan is enough.
3. Wait for the project to finish provisioning.

> Free projects are paused after a week without activity. Unpause from the
> dashboard if that happens; no data is lost.

## 2. Create the database schema

**Option A — SQL editor (simplest).**
Open **SQL Editor → New query**, paste the entire contents of
[`supabase/setup.sql`](../supabase/setup.sql), and click **Run**. You should see
"Success. No rows returned". Run it once on an empty project.

**Option B — Supabase CLI.**

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push            # applies supabase/migrations/*.sql
```

This creates:

| Object | Purpose |
| --- | --- |
| `profiles` | username (unique, case-insensitive), display name, avatar, rating, saved settings |
| `games` | full game state: FEN, PGN, moves, clocks, offers, result, rating changes |
| `active_players` | guarantees a player is never in two games at once |
| `challenges` | direct challenges (pending / accepted / declined / cancelled / expired) |
| `matchmaking_queue` | Quick Play queue |
| `game_messages` | in-game chat (rate limited) |
| `game_presence` | per-game heartbeats, used to verify abandonment claims |
| RPC functions | `create_challenge`, `respond_challenge`, `cancel_challenge`, `quick_play_join/poll/leave`, `accept_rematch`, `game_heartbeat`, `profile_stats`, `profile_games`, `username_available` |
| RLS policies | every table; players can read only their own games and chat |
| Realtime | `games`, `challenges`, `game_messages`, `matchmaking_queue` added to the `supabase_realtime` publication |
| Storage | public `avatars` bucket; users may only write to `avatars/<their-user-id>/…` |

## 3. Copy the API keys

**Project Settings → API Keys** (or **Settings → API** on older dashboards):

| Dashboard value | Environment variable |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`) **or** legacy `anon` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret key (`sb_secret_…`) **or** legacy `service_role` key | `SUPABASE_SERVICE_ROLE_KEY` |

The secret/service-role key bypasses Row Level Security. It is only read by the
server-side API routes (`src/lib/supabase/admin.ts` imports `server-only`).
Never expose it to the browser or commit it.

## 4. Configure authentication

**Authentication → URL Configuration**

- **Site URL:** your deployed URL, e.g. `https://grandmaster-yourname.vercel.app`
  (use `http://localhost:3000` until you deploy).
- **Redirect URLs:** add both
  - `http://localhost:3000/**`
  - `https://<your-deployed-domain>/**`

**Authentication → Sign In / Providers → Email**

- Keep **Email** enabled.
- **Confirm email** — choose one:
  - **Off:** new players are signed in immediately after registering. Easiest
    for playing with friends.
  - **On:** players must click a link in a confirmation email. Supabase's
    built-in email service is meant for testing only: it is heavily rate-limited
    and may only deliver to your project team's addresses. For real users, set
    up custom SMTP (below).

**Password reset emails** always need working email delivery. For anything
beyond testing, configure **Authentication → Emails → SMTP Settings** with any
SMTP provider (many have free tiers, e.g. Resend, Brevo or Postmark's trial).

### Optional: cross-device reset links

By default the reset link must be opened in the same browser that requested it
(the PKCE flow). To make links work on any device, edit
**Authentication → Emails → Templates → Reset Password** and use:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Reset your password</a>
```

The `/auth/confirm` route already supports this.

## 5. Realtime

Nothing to configure. `setup.sql` adds the tables to the `supabase_realtime`
publication (check **Database → Publications**). Presence works out of the
box. If you enabled "private channels only" under **Realtime → Settings**, turn it
off — the app uses public channels, with data access governed by RLS.

## 6. Check it works

Run the app (`npm run dev`), register two accounts in two different browsers
(or one normal and one private window), and they should see each other as
**Available** in the Lobby within a second or two.

## Local development with Docker (optional)

If you have Docker, the Supabase CLI can run the whole stack locally:

```bash
npx supabase start        # prints a local URL, anon key and service_role key
npx supabase db reset     # applies the migrations
```

Put the printed values into `.env.local`. Emails sent locally can be read in
Inbucket/Mailpit at the URL the CLI prints.
