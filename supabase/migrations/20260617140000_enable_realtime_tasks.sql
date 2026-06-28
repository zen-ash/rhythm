-- =============================================================================
-- Enable Supabase Realtime for the tasks table.
--
-- Idempotent: only adds tasks to the supabase_realtime publication if it is not
-- already a member, so re-running this migration never errors.
--
-- REPLICA IDENTITY FULL is required so DELETE events carry the full old row
-- (including user_id). Without it, deletes only emit the primary key, and the
-- client-side `user_id=eq.…` filter (and RLS) cannot match — so delete events
-- would never reach subscribers. This is a replication setting, not a schema
-- (column) change.
-- =============================================================================

alter table public.tasks replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end
$$;
