# Grandmaster — real-time multiplayer chess in 3D

A complete, deployable chess platform: accounts, a live lobby with real
presence, challenges and Quick Play, and server-authoritative games on a
hand-modelled 3D board (with a 2D mode for older devices). It runs entirely on
free tiers: Vercel for the app, Supabase for auth, Postgres, Realtime and Storage.

![Game room](docs/screenshots/game-3d.png)

| Landing | Lobby | Mobile |
| --- | --- | --- |
| ![Landing](docs/screenshots/landing.png) | ![Lobby](docs/screenshots/lobby.png) | ![Mobile game](docs/screenshots/mobile-game.png) |

## Features

**Play**
- Live lobby: who's **Available**, **Playing**, **Away** or **Offline**, based on real Realtime connections (not "last login"). Search players by username.
- Direct challenges with time control, colour and rated/casual options. They arrive instantly on any page, with an expiry countdown, and both sides see accept/decline in real time.
- **Quick Play** matchmaking by time control. Pairing is atomic in Postgres, so nobody is double-booked.
- Every rule of chess via [chess.js](https://github.com/jhlywa/chess.js), validated **on the server**: castling restrictions, en passant, promotion (with a picker), check, checkmate, stalemate, insufficient material.
- Draw by agreement; claimable threefold repetition and 50-move rule; automatic fivefold repetition and 75-move rule.
- Resign (with confirmation), abort before both sides have moved, rematch with colours swapped.
- Optional clocks (bullet → classical, with increment), timed by the server. Flag-fall is detected server-side, with the FIDE rule that you can't lose on time to someone who has no way to checkmate.
- Disconnects are handled: the opponent sees the player as disconnected, the game carries on, and after 90 s the remaining player can claim the win (checked against server heartbeats). Refreshing or switching device resumes the game exactly where it was.
- In-game chat (rate-limited, can be turned off).

**The board**
- React Three Fiber scene with procedurally modelled Staunton pieces (lathed profiles plus an extruded knight), in **Classic wood** and **Modern** styles, with PBR materials, an environment lighting rig, soft shadows and clearcoat reflections.
- Click-to-move or drag-and-drop, with legal-move dots, capture rings, last-move and check highlights, and a lifted selected piece.
- Animated moves (knights jump, castling rooks slide, captured pieces sink away, promotions pop), and orbit, zoom, flip and reset for the camera.
- Low / medium / high graphics quality. The board renders on demand, so it isn't redrawing 60 times a second while idle.
- A 2D board with an original SVG piece set. It's used automatically if WebGL is unavailable.

**Everything else**
- Email + password accounts, password reset, persistent sessions, unique usernames. Emails are never shown to other players.
- Profiles: avatar (piece emblem or photo upload), bio, Elo rating, games, wins, losses, draws, win %, and full history.
- Replay any finished game move by move (buttons or ← → keys). Games are stored as PGN, with FEN for the current position.
- Settings sync to your account: board mode, style, quality, animation speed, sound (synthesised, no audio files), legal-move hints, coordinates, auto-queen, chat.
- Responsive from phones to wide desktops.

## Architecture

```
 Browser (Next.js client)                          Supabase
 ┌─────────────────────────────┐   RLS-protected   ┌──────────────────────────┐
 │ React UI · R3F 3D board     │──── reads ───────▶│ Postgres                 │
 │ chess.js (local legality,   │◀── Realtime ──────│  profiles, games,        │
 │   instant feedback)         │  postgres_changes │  challenges, queue, chat │
 │ Presence (lobby channel)    │◀──── Presence ───▶│ Realtime                 │
 │ RPC: challenges, quick play │──── RPC ─────────▶│ SECURITY DEFINER funcs   │
 └──────────┬──────────────────┘                   │ Auth (GoTrue) · Storage  │
            │ POST /api/games/:id/{move,action}    └────────────▲─────────────┘
            ▼                                                   │ service role
 ┌─────────────────────────────┐   compare-and-swap on version  │
 │ Next.js route handlers      │────────────────────────────────┘
 │ 1. verify user JWT          │
 │ 2. replay game with chess.js│
 │ 3. engine.applyMove/Action  │  (pure, unit-tested state machine)
 │ 4. UPDATE … WHERE version=v │
 └─────────────────────────────┘
```

**Why it's safe and consistent**

- **Browsers can't write game state.** RLS lets players *read* only their own games. All moves and in-game actions go through the API routes, which authenticate the user, replay the game with chess.js, apply the pure state machine in [`src/lib/chess/engine.ts`](src/lib/chess/engine.ts), and write with the service role.
- **Atomic moves.** Each write is a single `UPDATE … WHERE id = $1 AND version = $2`. If two requests race (a double-click, both players acting at once, a flag claim against a move), exactly one wins and the other gets `409` along with the fresh state. The client also sends the `ply` it believes it's at, so duplicate and out-of-order submissions are rejected.
- **Lobby operations are transactions.** Challenges, acceptance, Quick Play and rematches are `SECURITY DEFINER` functions that use `auth.uid()`, row locks and advisory locks. `active_players.user_id` is a primary key, so a player can never end up in two games, whichever path tries.
- **Clocks are server time.** `turn_started_at` and the remaining time are stored. Clients only *display* clocks, corrected for their clock offset (`/api/time`).
- **Ratings and stats** are computed by a trigger in the same transaction that ends the game.
- **Resilience.** Realtime pushes updates; polling is the safety net (every 2.5 s if the channel is down, 20 s otherwise, and immediately on focus or reconnect). Optimistic moves are rolled back if the server rejects them.

### Code map

```
src/
  app/                    routes (App Router)
    (marketing)/          landing page
    (auth)/               login, register, forgot/reset password
    (app)/                dashboard, lobby, game/[id], profile/[username], settings
    api/games/[id]/       move + action route handlers (server-authoritative)
    auth/                 email-link callbacks (PKCE code and token-hash)
  components/
    board3d/              R3F scene, procedural piece geometry, canvas textures
    board2d/              SVG board
    board/                shared board props, selection logic, 3D/2D switch
    game/                 game room, useGame hook, clocks, move list, chat, promotion
    lobby/                player list, challenges, quick play
    profile/  ui/  layout/
  lib/
    chess/                engine (state machine), rules, clocks, piece tracking
    realtime/             presence + challenge providers
    supabase/             browser / server / admin clients
    server/               auth + persistence helpers for API routes
  proxy.ts                session refresh + route protection (Next 16 "proxy")
supabase/
  migrations/             schema, RLS, functions, triggers, storage
  setup.sql               all migrations in one file for the SQL editor
scripts/local-stack/      local Supabase-compatible backend for automated tests
tests/
  unit/                   engine + piece tracking (vitest)
  db/                     RLS, RPCs, triggers and concurrency against real Postgres
  integration/            live API routes with real auth tokens
  e2e/                    Playwright: two browsers playing each other
```

## Getting started

**Prerequisites:** Node.js 20.9+ and a free Supabase project.

```bash
git clone <this repo> grandmaster && cd grandmaster
npm install
cp .env.example .env.local      # fill in your Supabase URL and keys
```

1. Set up Supabase: follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md). Short version: run `supabase/setup.sql` in the SQL editor, copy the URL and keys, then set the Site URL and redirect URLs.
2. Run `npm run dev` and open <http://localhost:3000>.
3. Register two accounts in two browsers (or a normal and a private window) and play.

If the Supabase variables are missing, the site still loads. It shows a clear "Backend not configured" notice instead of pretending to work.

## Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). On Vercel: import the repo, add the four environment variables, deploy, then add the deployed URL to Supabase's auth URL settings.

## Testing

| Command | What it covers | Needs |
| --- | --- | --- |
| `npm test` | Chess state machine and piece tracking: every special move, all draw rules, clocks and flag-fall, offers, abort/resign, abandonment, rematch (48 tests) | nothing |
| `npm run test:db` | RLS, column privileges, every RPC, Elo trigger, and concurrency (simultaneous accepts, 8-way Quick Play, CAS races), private settings, avatar URL rules, chat limits on real Postgres (19 tests) | `TEST_DATABASE_URL` |
| `npm run test:integration` | The live API with real JWTs: full game to mate, 6 identical concurrent submissions → exactly 1 accepted, outsiders blocked, server clock enforcement, rematch races, abandonment, CSRF guards (8 tests) | app + backend, `TEST_*` vars |
| `npm run test:e2e` | Two real browsers: register, presence, challenge, play to checkmate, chat, refresh, forged move rejected, replay, rematch, draw offer, resign, history, offline status; Quick Play; password reset by email; 3D click and drag moves; phone with touch going offline and back; profile editing, avatar upload and settings syncing across devices (6 scenarios) | app + backend |

### The local test stack

`npm run stack:start` brings up a Supabase-compatible backend on
`http://localhost:54321` without Docker: system PostgreSQL 16, Supabase's real
**GoTrue** auth server and **PostgREST**, plus three small stand-ins in
`scripts/local-stack/`. These are a realtime server that speaks the Supabase
Realtime wire protocol (presence, and postgres_changes with per-subscriber RLS
checks), an avatar storage endpoint, and an SMTP catcher. The stand-ins are
test doubles only; in production the app uses Supabase Realtime and Storage
directly. If you have Docker, `npx supabase start` is the better option for
everyday development.

```bash
npm run stack:start                      # writes .env.test.local
set -a; . ./.env.test.local; set +a
npm run build && npm start &             # or npm run dev
TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/grandmaster npm run test:db
TEST_APP_URL=http://localhost:3000 TEST_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
  TEST_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY TEST_SERVICE_KEY=$SUPABASE_SERVICE_ROLE_KEY npm run test:integration
E2E_MAIL_URL=http://127.0.0.1:8025/messages npm run test:e2e
```

> `test:db` creates throwaway users and wipes the matchmaking queue. Point it
> at a test database, never at production.

## Configuration reference

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | publishable/anon key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` also accepted) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | secret/service-role key for validated game writes (`SUPABASE_SECRET_KEY` also accepted) |
| `NEXT_PUBLIC_SITE_URL` | client + server | public URL for email links |

## Known limitations

- Games without a clock are always casual, and games that end before each side has made two moves are unrated (prevents rating farming). In untimed games, a player who sits on their move for 30 minutes can be claimed against.
- One active game per player at a time (by design; it keeps "Playing" status and abandonment rules unambiguous).
- The moves of a game are visible only to its two players. Other people see results and metadata on profiles, but not the moves (there's no spectating).
- Supabase's built-in email is for testing. Set up custom SMTP for reliable confirmation and reset emails (see the setup guide).
- Draw claims (threefold, 50-move) can be made by either player whenever the current position qualifies. This is slightly more permissive than the strict FIDE claim procedure.

## Tech

Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Three.js · React Three Fiber · Drei · chess.js · Supabase (Postgres, Auth, Realtime, Storage) · Zustand · Vitest · Playwright.

MIT licensed. The board, pieces, piece icons, sounds and logo were all created for this project and contain no third-party assets.
