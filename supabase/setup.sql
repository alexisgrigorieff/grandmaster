-- Grandmaster: complete database setup, generated from supabase/migrations (npm run db:setup-sql).
-- Paste this whole file into the Supabase SQL editor and run it once.

-- =============================================================================
-- Grandmaster — initial schema
--
-- Security model
--   * Every table has row-level security enabled.
--   * Browsers (roles `anon` / `authenticated`) can READ what they are allowed to
--     see, but can never write game state directly.
--   * Game moves and in-game actions go through the Next.js API, which validates
--     them with chess.js and writes with the service role using an optimistic
--     compare-and-swap on `games.version` (see src/lib/server/games.ts).
--   * Lobby operations (challenges, quick play, rematch acceptance) are
--     SECURITY DEFINER functions that derive the caller from auth.uid() and run
--     inside a single transaction, so they are atomic.
--   * `active_players` has user_id as its primary key: a player can never be
--     placed into two simultaneous games, whichever path tries to do it.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text not null,
  display_name   text not null,
  avatar_url     text,
  avatar_preset  text not null default 'knight-amber',
  bio            text not null default '',
  rating         integer not null default 1200,
  rated_games    integer not null default 0,
  preferences    jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint profiles_display_name_len check (char_length(btrim(display_name)) between 1 and 40),
  constraint profiles_bio_len check (char_length(bio) <= 160),
  constraint profiles_avatar_preset_format check (avatar_preset ~ '^[a-z]+-[a-z]+$'),
  constraint profiles_avatar_url_len check (avatar_url is null or char_length(avatar_url) <= 500),
  -- Only images uploaded to this user's own folder in the avatars bucket.
  constraint profiles_avatar_url_own_folder check (
    avatar_url is null
    or (avatar_url ~ '^https?://' and position(('/storage/v1/object/public/avatars/' || id::text || '/') in avatar_url) > 0)
  ),
  constraint profiles_preferences_size check (pg_column_size(preferences) <= 4096)
);

create unique index profiles_username_lower_key on public.profiles (lower(username));

alter table public.profiles enable row level security;

-- Usernames, display names and avatars are public. Email addresses live only in
-- auth.users, which is never exposed through the API.
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
-- Everything except the private `preferences` blob is public.
grant select (id, username, display_name, avatar_url, avatar_preset, bio, rating, rated_games, created_at, updated_at)
  on public.profiles to anon, authenticated;
-- Column-level privileges: ratings and usernames cannot be changed by users.
grant update (display_name, avatar_url, avatar_preset, bio, preferences) on public.profiles to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create the profile row whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := nullif(btrim(new.raw_user_meta_data ->> 'username'), '');
  v_display  text := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
begin
  if v_username is null or v_username !~ '^[A-Za-z0-9_]{3,20}$' then
    v_username := 'player_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  if exists (select 1 from public.profiles where lower(username) = lower(v_username)) then
    raise exception 'USERNAME_TAKEN' using errcode = '23505';
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, left(coalesce(v_display, v_username), 40));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The signed-in user's own saved settings (not readable by anyone else).
create or replace function public.my_preferences()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select preferences from public.profiles where id = auth.uid();
$$;

revoke all on function public.my_preferences() from public, anon;
grant execute on function public.my_preferences() to authenticated;

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_username ~ '^[A-Za-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where lower(username) = lower(p_username));
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Games
-- -----------------------------------------------------------------------------
create type public.game_status as enum ('active', 'finished', 'aborted');

create table public.games (
  id                  uuid primary key default gen_random_uuid(),
  white_id            uuid not null references public.profiles (id) on delete cascade,
  black_id            uuid not null references public.profiles (id) on delete cascade,
  status              public.game_status not null default 'active',
  result              text,
  termination         text,
  initial_fen         text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  fen                 text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn                 text not null default '',
  -- [{ "u": "e2e4", "s": "e4", "c": 299000 }]  (uci, san, mover's clock after the move)
  moves               jsonb not null default '[]'::jsonb,
  ply                 integer not null default 0,
  version             integer not null default 0,
  initial_ms          integer,
  increment_ms        integer not null default 0,
  white_ms            integer,
  black_ms            integer,
  turn_started_at     timestamptz,
  draw_offer_by       uuid references public.profiles (id) on delete set null,
  white_draw_ply      integer,
  black_draw_ply      integer,
  rematch_offer_by    uuid references public.profiles (id) on delete set null,
  rematch_game_id     uuid references public.games (id) on delete set null,
  rated               boolean not null default true,
  source              text not null default 'challenge',
  white_rating        integer,
  black_rating        integer,
  white_rating_diff   integer,
  black_rating_diff   integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  finished_at         timestamptz,
  constraint games_distinct_players check (white_id <> black_id),
  constraint games_result_values check (result is null or result in ('1-0', '0-1', '1/2-1/2')),
  constraint games_finished_has_result check (status <> 'finished' or result is not null),
  constraint games_time_control check (
    (initial_ms is null and white_ms is null and black_ms is null)
    or (initial_ms between 30000 and 10800000 and white_ms is not null and black_ms is not null)
  ),
  constraint games_increment check (increment_ms between 0 and 180000),
  constraint games_source check (source in ('challenge', 'quickplay', 'rematch'))
);

create index games_white_idx on public.games (white_id, created_at desc);
create index games_black_idx on public.games (black_id, created_at desc);
create index games_active_idx on public.games (status) where status = 'active';

alter table public.games enable row level security;

-- Only the two participants can read a game.
create policy "Participants can read their games"
  on public.games for select
  to authenticated
  using ((select auth.uid()) in (white_id, black_id));

revoke all on public.games from anon, authenticated;
grant select on public.games to authenticated;

create trigger games_touch before update on public.games
  for each row execute function public.touch_updated_at();

-- One active game per player, enforced by a primary key.
create table public.active_players (
  user_id  uuid primary key references public.profiles (id) on delete cascade,
  game_id  uuid not null references public.games (id) on delete cascade
);

alter table public.active_players enable row level security;
create policy "Players can see their own active game"
  on public.active_players for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.active_players from anon, authenticated;
grant select on public.active_players to authenticated;

-- Per-game connection heartbeats (used to allow claiming an abandoned game).
create table public.game_presence (
  game_id      uuid not null references public.games (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

alter table public.game_presence enable row level security;
create policy "Participants can read game presence"
  on public.game_presence for select to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_id and (select auth.uid()) in (g.white_id, g.black_id)
  ));
revoke all on public.game_presence from anon, authenticated;
grant select on public.game_presence to authenticated;

-- Game finished/aborted: release the players, compute Elo.
create or replace function public.games_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_w   public.profiles;
  v_b   public.profiles;
  v_ew  double precision;
  v_sw  double precision;
  v_kw  integer;
  v_kb  integer;
  v_dw  integer;
  v_db  integer;
begin
  -- Immutable columns.
  new.id := old.id;
  new.white_id := old.white_id;
  new.black_id := old.black_id;
  new.created_at := old.created_at;
  new.initial_fen := old.initial_fen;

  -- A finished game can never become active again.
  if old.status <> 'active' and new.status = 'active' then
    raise exception 'GAME_ALREADY_OVER';
  end if;

  if old.status = 'active' and new.status <> 'active' then
    new.finished_at := coalesce(new.finished_at, now());
    new.draw_offer_by := null;

    -- Games that end before each side has made two moves don't count for
    -- ratings (stops trivial rating farming with throwaway accounts).
    if new.status = 'finished' and new.rated and new.ply < 4 then
      new.rated := false;
    end if;

    if new.status = 'finished' and new.rated then
      -- Lock both profiles in a consistent order to avoid deadlocks.
      perform 1 from public.profiles where id in (new.white_id, new.black_id) order by id for update;
      select * into v_w from public.profiles where id = new.white_id;
      select * into v_b from public.profiles where id = new.black_id;

      v_ew := 1.0 / (1.0 + power(10.0, (v_b.rating - v_w.rating) / 400.0));
      v_sw := case new.result when '1-0' then 1.0 when '0-1' then 0.0 else 0.5 end;
      v_kw := case when v_w.rated_games < 30 then 40 else 20 end;
      v_kb := case when v_b.rated_games < 30 then 40 else 20 end;
      v_dw := round(v_kw * (v_sw - v_ew));
      v_db := round(v_kb * ((1.0 - v_sw) - (1.0 - v_ew)));

      new.white_rating := v_w.rating;
      new.black_rating := v_b.rating;
      new.white_rating_diff := v_dw;
      new.black_rating_diff := v_db;

      update public.profiles set rating = greatest(100, rating + v_dw), rated_games = rated_games + 1 where id = new.white_id;
      update public.profiles set rating = greatest(100, rating + v_db), rated_games = rated_games + 1 where id = new.black_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger games_before_update before update on public.games
  for each row execute function public.games_before_update();

create or replace function public.games_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status <> 'active' then
    delete from public.active_players where game_id = new.id;
  end if;
  return null;
end;
$$;

create trigger games_after_update after update on public.games
  for each row execute function public.games_after_update();

-- -----------------------------------------------------------------------------
-- Game chat
-- -----------------------------------------------------------------------------
create table public.game_messages (
  id          bigint generated always as identity primary key,
  game_id     uuid not null references public.games (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint game_messages_body_len check (char_length(btrim(body)) between 1 and 300)
);

create index game_messages_game_idx on public.game_messages (game_id, id);
create index game_messages_user_idx on public.game_messages (user_id, created_at);

alter table public.game_messages enable row level security;

create policy "Participants can read chat"
  on public.game_messages for select to authenticated
  using (exists (
    select 1 from public.games g
    where g.id = game_id and (select auth.uid()) in (g.white_id, g.black_id)
  ));

create policy "Participants can write chat as themselves"
  on public.game_messages for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.games g
      where g.id = game_id and (select auth.uid()) in (g.white_id, g.black_id)
    )
  );

revoke all on public.game_messages from anon, authenticated;
grant select on public.game_messages to authenticated;
grant insert (game_id, body) on public.game_messages to authenticated;

create or replace function public.game_messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  new.created_at := now();
  new.body := btrim(new.body);
  perform pg_advisory_xact_lock(hashtextextended('chat:' || new.user_id::text, 0));
  if not exists (
    select 1 from public.games g
    where g.id = new.game_id and (g.status = 'active' or g.finished_at > now() - interval '1 hour')
  ) then
    raise exception 'CHAT_CLOSED' using hint = 'Chat closes an hour after the game ends.';
  end if;
  if (select count(*) from public.game_messages
      where user_id = new.user_id and created_at > now() - interval '10 seconds') >= 6 then
    raise exception 'CHAT_RATE_LIMIT' using hint = 'Slow down a little.';
  end if;
  return new;
end;
$$;

create trigger game_messages_rate_limit before insert on public.game_messages
  for each row execute function public.game_messages_rate_limit();

-- -----------------------------------------------------------------------------
-- Challenges
-- -----------------------------------------------------------------------------
create type public.challenge_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'expired');

create table public.challenges (
  id            uuid primary key default gen_random_uuid(),
  from_id       uuid not null references public.profiles (id) on delete cascade,
  to_id         uuid not null references public.profiles (id) on delete cascade,
  status        public.challenge_status not null default 'pending',
  color         text not null default 'random',
  initial_ms    integer,
  increment_ms  integer not null default 0,
  rated         boolean not null default true,
  game_id       uuid references public.games (id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '90 seconds',
  responded_at  timestamptz,
  constraint challenges_distinct check (from_id <> to_id),
  constraint challenges_color check (color in ('white', 'black', 'random')),
  constraint challenges_time check (initial_ms is null or initial_ms between 30000 and 10800000),
  constraint challenges_increment check (increment_ms between 0 and 180000)
);

-- At most one pending challenge per (challenger, opponent).
create unique index challenges_one_pending on public.challenges (from_id, to_id) where status = 'pending';
create index challenges_to_idx on public.challenges (to_id, status);
create index challenges_from_idx on public.challenges (from_id, status);

alter table public.challenges enable row level security;
create policy "Players see challenges they sent or received"
  on public.challenges for select to authenticated
  using ((select auth.uid()) in (from_id, to_id));
revoke all on public.challenges from anon, authenticated;
grant select on public.challenges to authenticated;

-- -----------------------------------------------------------------------------
-- Quick-play matchmaking queue
-- -----------------------------------------------------------------------------
create table public.matchmaking_queue (
  user_id       uuid primary key references public.profiles (id) on delete cascade,
  initial_ms    integer,
  increment_ms  integer not null default 0,
  game_id       uuid references public.games (id) on delete cascade,
  created_at    timestamptz not null default now(),
  heartbeat_at  timestamptz not null default now()
);

alter table public.matchmaking_queue enable row level security;
create policy "Players see their own queue entry"
  on public.matchmaking_queue for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.matchmaking_queue from anon, authenticated;
grant select on public.matchmaking_queue to authenticated;

-- -----------------------------------------------------------------------------
-- Internal: start a game (single creation path for every kind of game)
-- -----------------------------------------------------------------------------
create or replace function public._validate_time_control(p_initial_ms integer, p_increment_ms integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_initial_ms is not null and (p_initial_ms < 30000 or p_initial_ms > 10800000) then
    raise exception 'INVALID_TIME_CONTROL';
  end if;
  if coalesce(p_increment_ms, 0) < 0 or coalesce(p_increment_ms, 0) > 180000 then
    raise exception 'INVALID_TIME_CONTROL';
  end if;
end;
$$;

create or replace function public._start_game(
  p_white uuid,
  p_black uuid,
  p_initial_ms integer,
  p_increment_ms integer,
  p_rated boolean,
  p_source text
)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.games;
begin
  if p_white = p_black then
    raise exception 'CANNOT_PLAY_SELF';
  end if;
  perform public._validate_time_control(p_initial_ms, p_increment_ms);

  -- Games without a clock are always casual: nobody can be held hostage in a rated game.
  insert into public.games (white_id, black_id, initial_ms, increment_ms, white_ms, black_ms, rated, source)
  values (p_white, p_black, p_initial_ms, coalesce(p_increment_ms, 0), p_initial_ms, p_initial_ms,
          coalesce(p_rated, true) and p_initial_ms is not null, p_source)
  returning * into v_game;

  begin
    insert into public.active_players (user_id, game_id) values (p_white, v_game.id), (p_black, v_game.id);
  exception when unique_violation then
    raise exception 'PLAYER_BUSY' using hint = 'One of the players is already in a game.';
  end;

  -- Both players are now busy: withdraw everything else that is pending for them.
  update public.challenges
     set status = 'cancelled', responded_at = now()
   where status = 'pending'
     and (from_id in (p_white, p_black) or to_id in (p_white, p_black));

  -- Leave the quick-play queue (quick play itself marks its two rows as matched).
  if p_source <> 'quickplay' then
    delete from public.matchmaking_queue
     where user_id in (p_white, p_black) and game_id is null;
  end if;

  return v_game;
end;
$$;

revoke all on function public._start_game(uuid, uuid, integer, integer, boolean, text) from public, anon, authenticated;
revoke all on function public._validate_time_control(integer, integer) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Challenges API
-- -----------------------------------------------------------------------------
create or replace function public.create_challenge(
  p_to uuid,
  p_color text default 'random',
  p_initial_ms integer default null,
  p_increment_ms integer default 0,
  p_rated boolean default true
)
returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.challenges;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_to is null or p_to = v_me then raise exception 'CANNOT_CHALLENGE_SELF'; end if;
  if p_color not in ('white', 'black', 'random') then raise exception 'INVALID_COLOR'; end if;
  perform public._validate_time_control(p_initial_ms, p_increment_ms);
  if not exists (select 1 from public.profiles where id = p_to) then raise exception 'PLAYER_NOT_FOUND'; end if;

  -- Serialise challenge creation for this pair.
  perform pg_advisory_xact_lock(hashtextextended('challenge:' || least(v_me, p_to)::text || greatest(v_me, p_to)::text, 0));

  update public.challenges set status = 'expired'
   where status = 'pending' and expires_at < now()
     and (from_id in (v_me, p_to) or to_id in (v_me, p_to));

  if exists (select 1 from public.active_players where user_id = v_me) then
    raise exception 'YOU_ARE_IN_A_GAME';
  end if;
  if exists (select 1 from public.active_players where user_id = p_to) then
    raise exception 'OPPONENT_IN_A_GAME';
  end if;
  if exists (select 1 from public.challenges where status = 'pending' and from_id = v_me and to_id = p_to) then
    raise exception 'CHALLENGE_ALREADY_PENDING';
  end if;
  -- They already challenged us: the client should accept that instead.
  if exists (select 1 from public.challenges where status = 'pending' and from_id = p_to and to_id = v_me) then
    raise exception 'OPPONENT_ALREADY_CHALLENGED_YOU';
  end if;
  if (select count(*) from public.challenges where status = 'pending' and from_id = v_me) >= 5 then
    raise exception 'TOO_MANY_CHALLENGES';
  end if;

  insert into public.challenges (from_id, to_id, color, initial_ms, increment_ms, rated)
  values (v_me, p_to, p_color, p_initial_ms, coalesce(p_increment_ms, 0), coalesce(p_rated, true) and p_initial_ms is not null)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.respond_challenge(p_challenge uuid, p_accept boolean)
returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.challenges;
  v_white uuid;
  v_black uuid;
  v_game public.games;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_row from public.challenges where id = p_challenge for update;
  if not found or v_row.to_id <> v_me then raise exception 'CHALLENGE_NOT_FOUND'; end if;
  if v_row.status <> 'pending' then raise exception 'CHALLENGE_NOT_PENDING'; end if;
  if v_row.expires_at < now() then
    update public.challenges set status = 'expired' where id = v_row.id returning * into v_row;
    return v_row;
  end if;

  if not p_accept then
    update public.challenges set status = 'declined', responded_at = now()
     where id = v_row.id returning * into v_row;
    return v_row;
  end if;

  if v_row.color = 'white' then
    v_white := v_row.from_id; v_black := v_row.to_id;
  elsif v_row.color = 'black' then
    v_white := v_row.to_id; v_black := v_row.from_id;
  elsif random() < 0.5 then
    v_white := v_row.from_id; v_black := v_row.to_id;
  else
    v_white := v_row.to_id; v_black := v_row.from_id;
  end if;

  v_game := public._start_game(v_white, v_black, v_row.initial_ms, v_row.increment_ms, v_row.rated, 'challenge');

  update public.challenges
     set status = 'accepted', game_id = v_game.id, responded_at = now()
   where id = v_row.id
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.cancel_challenge(p_challenge uuid)
returns public.challenges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.challenges;
begin
  update public.challenges set status = 'cancelled', responded_at = now()
   where id = p_challenge and from_id = auth.uid() and status = 'pending'
  returning * into v_row;
  if not found then raise exception 'CHALLENGE_NOT_PENDING'; end if;
  return v_row;
end;
$$;

revoke all on function public.create_challenge(uuid, text, integer, integer, boolean) from public, anon;
revoke all on function public.respond_challenge(uuid, boolean) from public, anon;
revoke all on function public.cancel_challenge(uuid) from public, anon;
grant execute on function public.create_challenge(uuid, text, integer, integer, boolean) to authenticated;
grant execute on function public.respond_challenge(uuid, boolean) to authenticated;
grant execute on function public.cancel_challenge(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Quick play
--   A global advisory lock serialises matchmaking, so two players can never be
--   paired twice or paired with two different opponents at the same time.
-- -----------------------------------------------------------------------------
create or replace function public._quick_play_try_match(p_me uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mine public.matchmaking_queue;
  v_other public.matchmaking_queue;
  v_game public.games;
begin
  select * into v_mine from public.matchmaking_queue where user_id = p_me;
  if not found then return null; end if;
  if v_mine.game_id is not null then return v_mine.game_id; end if;

  select q.* into v_other
    from public.matchmaking_queue q
   where q.user_id <> p_me
     and q.game_id is null
     and q.initial_ms is not distinct from v_mine.initial_ms
     and q.increment_ms = v_mine.increment_ms
     and q.heartbeat_at > now() - interval '15 seconds'
     and not exists (select 1 from public.active_players a where a.user_id = q.user_id)
   order by q.created_at
   limit 1;
  if not found then return null; end if;

  if random() < 0.5 then
    v_game := public._start_game(v_other.user_id, p_me, v_mine.initial_ms, v_mine.increment_ms, true, 'quickplay');
  else
    v_game := public._start_game(p_me, v_other.user_id, v_mine.initial_ms, v_mine.increment_ms, true, 'quickplay');
  end if;

  update public.matchmaking_queue set game_id = v_game.id, heartbeat_at = now()
   where user_id in (p_me, v_other.user_id);
  return v_game.id;
end;
$$;

revoke all on function public._quick_play_try_match(uuid) from public, anon, authenticated;

create or replace function public.quick_play_join(p_initial_ms integer default 300000, p_increment_ms integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_game uuid;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public._validate_time_control(p_initial_ms, p_increment_ms);
  perform pg_advisory_xact_lock(hashtextextended('matchmaking', 0));

  if exists (select 1 from public.active_players where user_id = v_me) then
    raise exception 'YOU_ARE_IN_A_GAME';
  end if;

  delete from public.matchmaking_queue where heartbeat_at < now() - interval '2 minutes';

  insert into public.matchmaking_queue (user_id, initial_ms, increment_ms)
  values (v_me, p_initial_ms, coalesce(p_increment_ms, 0))
  on conflict (user_id) do update
    set initial_ms = excluded.initial_ms,
        increment_ms = excluded.increment_ms,
        game_id = null,
        created_at = now(),
        heartbeat_at = now();

  v_game := public._quick_play_try_match(v_me);
  return jsonb_build_object('status', case when v_game is null then 'waiting' else 'matched' end, 'game_id', v_game);
end;
$$;

create or replace function public.quick_play_poll()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_row public.matchmaking_queue;
  v_game uuid;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('matchmaking', 0));

  update public.matchmaking_queue set heartbeat_at = now() where user_id = v_me returning * into v_row;
  if not found then
    return jsonb_build_object('status', 'idle', 'game_id', null);
  end if;
  if v_row.game_id is not null then
    return jsonb_build_object('status', 'matched', 'game_id', v_row.game_id);
  end if;
  v_game := public._quick_play_try_match(v_me);
  return jsonb_build_object('status', case when v_game is null then 'waiting' else 'matched' end, 'game_id', v_game);
end;
$$;

create or replace function public.quick_play_leave()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('matchmaking', 0));
  delete from public.matchmaking_queue where user_id = auth.uid();
end;
$$;

revoke all on function public.quick_play_join(integer, integer) from public, anon;
revoke all on function public.quick_play_poll() from public, anon;
revoke all on function public.quick_play_leave() from public, anon;
grant execute on function public.quick_play_join(integer, integer) to authenticated;
grant execute on function public.quick_play_poll() to authenticated;
grant execute on function public.quick_play_leave() to authenticated;

-- -----------------------------------------------------------------------------
-- Rematch acceptance (atomic: lock old game, create the new one, link them)
-- Called by the API with the service role after authenticating the user.
-- -----------------------------------------------------------------------------
create or replace function public.accept_rematch(p_game uuid, p_user uuid)
returns public.games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.games;
  v_new public.games;
begin
  select * into v_old from public.games where id = p_game for update;
  if not found or p_user not in (v_old.white_id, v_old.black_id) then
    raise exception 'GAME_NOT_FOUND';
  end if;
  if v_old.rematch_game_id is not null then
    select * into v_new from public.games where id = v_old.rematch_game_id;
    return v_new;
  end if;
  if v_old.status = 'active' then raise exception 'GAME_NOT_OVER'; end if;
  if v_old.rematch_offer_by is null or v_old.rematch_offer_by = p_user then
    raise exception 'NO_REMATCH_OFFER';
  end if;
  if v_old.finished_at < now() - interval '15 minutes' then
    raise exception 'REMATCH_EXPIRED';
  end if;

  -- Colours swap.
  v_new := public._start_game(v_old.black_id, v_old.white_id, v_old.initial_ms, v_old.increment_ms, v_old.rated, 'rematch');

  update public.games
     set rematch_game_id = v_new.id, rematch_offer_by = null, version = version + 1
   where id = v_old.id;
  return v_new;
end;
$$;

revoke all on function public.accept_rematch(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_rematch(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- In-game heartbeat
-- -----------------------------------------------------------------------------
create or replace function public.game_heartbeat(p_game uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if not exists (select 1 from public.games where id = p_game and v_me in (white_id, black_id)) then
    raise exception 'GAME_NOT_FOUND';
  end if;
  insert into public.game_presence (game_id, user_id, last_seen_at)
  values (p_game, v_me, now())
  on conflict (game_id, user_id) do update set last_seen_at = now();
end;
$$;

revoke all on function public.game_heartbeat(uuid) from public, anon;
grant execute on function public.game_heartbeat(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Public profile statistics and match history (metadata only; the moves of a
-- game remain visible only to its two players).
-- -----------------------------------------------------------------------------
create or replace function public.profile_stats(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'games',  count(*),
    'wins',   count(*) filter (where (g.white_id = p_user and g.result = '1-0') or (g.black_id = p_user and g.result = '0-1')),
    'losses', count(*) filter (where (g.white_id = p_user and g.result = '0-1') or (g.black_id = p_user and g.result = '1-0')),
    'draws',  count(*) filter (where g.result = '1/2-1/2')
  )
  from public.games g
  where g.status = 'finished' and p_user in (g.white_id, g.black_id);
$$;

create or replace function public.profile_games(p_user uuid, p_limit integer default 20, p_before timestamptz default null)
returns table (
  id uuid,
  created_at timestamptz,
  finished_at timestamptz,
  color text,
  result text,
  termination text,
  outcome text,
  initial_ms integer,
  increment_ms integer,
  rated boolean,
  rating_diff integer,
  ply integer,
  opponent_id uuid,
  opponent_username text,
  opponent_display_name text,
  opponent_avatar_url text,
  opponent_avatar_preset text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id, g.created_at, g.finished_at,
    case when g.white_id = p_user then 'white' else 'black' end,
    g.result, g.termination,
    case
      when g.result = '1/2-1/2' then 'draw'
      when (g.white_id = p_user and g.result = '1-0') or (g.black_id = p_user and g.result = '0-1') then 'win'
      else 'loss'
    end,
    g.initial_ms, g.increment_ms, g.rated,
    case when g.white_id = p_user then g.white_rating_diff else g.black_rating_diff end,
    g.ply,
    o.id, o.username, o.display_name, o.avatar_url, o.avatar_preset
  from public.games g
  join public.profiles o on o.id = case when g.white_id = p_user then g.black_id else g.white_id end
  where g.status = 'finished'
    and p_user in (g.white_id, g.black_id)
    and (p_before is null or g.finished_at < p_before)
  order by g.finished_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

grant execute on function public.profile_stats(uuid) to anon, authenticated;
grant execute on function public.profile_games(uuid, integer, timestamptz) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Explicit API-role privileges (don't rely on project-level default grants)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- Future objects in `public` are not exposed to the API roles unless a
-- migration grants them explicitly.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

alter publication supabase_realtime add table public.games, public.challenges, public.game_messages, public.matchmaking_queue;
-- Public bucket for uploaded avatars. Each user may only write inside a folder
-- named after their own user id:  avatars/<user-id>/avatar-<timestamp>.webp
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users can upload their own avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can replace their own avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "Users can delete their own avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
