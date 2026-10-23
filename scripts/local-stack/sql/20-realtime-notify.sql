-- Local test stack only: the realtime stand-in (scripts/local-stack/realtime-lite.mjs)
-- learns about row changes through LISTEN/NOTIFY instead of logical replication.
-- Hosted Supabase uses the `supabase_realtime` publication declared in the
-- migrations; this file is never applied there.
create or replace function public._local_realtime_notify()
returns trigger
language plpgsql
as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
  v_key text := coalesce(v_row ->> 'id', v_row ->> 'user_id');
begin
  perform pg_notify('local_realtime', json_build_object(
    'table', tg_table_name,
    'type', tg_op,
    'key', v_key,
    'old', case when tg_op = 'DELETE' then v_row else null end,
    'ts', now()
  )::text);
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['games', 'challenges', 'game_messages', 'matchmaking_queue'] loop
    execute format('drop trigger if exists _local_realtime on public.%I', t);
    execute format('create trigger _local_realtime after insert or update or delete on public.%I for each row execute function public._local_realtime_notify()', t);
  end loop;
end;
$$;
