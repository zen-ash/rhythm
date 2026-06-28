-- =============================================================================
-- Auto-create a profiles row whenever a new auth user signs up.
--
-- Runs as SECURITY DEFINER (owned by the postgres role) so it can insert past
-- the owner-only RLS policy on public.profiles. search_path is pinned to '' and
-- every object is fully qualified, per Supabase security guidance.
-- =============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (new.id, null, 'America/New_York');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
