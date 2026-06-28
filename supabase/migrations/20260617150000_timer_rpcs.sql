-- =============================================================================
-- Phase 5: Realtime for focus_sessions + guarded timer RPCs.
--
-- Timer correctness rules:
--  * Elapsed time is NEVER a live DB counter. now() (server time) is the only
--    trusted clock; client timestamps are ignored.
--  * pause/end bank the running segment into accumulated_seconds.
--  * timer_action_logs.(user_id, client_action_id) gives idempotency: a retried
--    action (e.g. after a mobile connection drop) is detected via unique
--    violation and returns the current session instead of double-applying.
--  * RLS + auth.uid() guarantee a user can only touch their own task/session.
--    Functions run SECURITY INVOKER (the default), so RLS still applies.
-- =============================================================================

-- --- Realtime for focus_sessions --------------------------------------------
alter table public.focus_sessions replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'focus_sessions'
  ) then
    alter publication supabase_realtime add table public.focus_sessions;
  end if;
end
$$;

-- --- start_timer -------------------------------------------------------------
create or replace function public.start_timer(
  p_task_id uuid,
  p_client_action_id text
)
returns public.focus_sessions
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.focus_sessions;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  -- Idempotency: record the action (append-only; focus_session_id stays NULL
  -- because the session does not exist yet). A duplicate means it already ran.
  begin
    insert into public.timer_action_logs (user_id, client_action_id, action_type)
    values (v_uid, p_client_action_id, 'start');
  exception when unique_violation then
    -- Already processed (e.g. a retried request). Return the user's current
    -- active session — start creates at most one (running or paused) session.
    select * into v_session
    from public.focus_sessions
    where user_id = v_uid and status in ('running', 'paused')
    order by started_at desc
    limit 1;
    return v_session;
  end;

  -- Task must belong to the caller.
  if not exists (
    select 1 from public.tasks
    where id = p_task_id and user_id = v_uid
  ) then
    raise exception 'Task not found';
  end if;

  -- One active timer per user (also enforced by the partial unique index).
  if exists (
    select 1 from public.focus_sessions
    where user_id = v_uid and status in ('running', 'paused')
  ) then
    raise exception 'An active timer already exists';
  end if;

  insert into public.focus_sessions (
    user_id, task_id, status, started_at, last_resumed_at, accumulated_seconds
  )
  values (v_uid, p_task_id, 'running', now(), now(), 0)
  returning * into v_session;

  -- Task moves to in_progress (task completion stays separate).
  update public.tasks
  set status = 'in_progress'
  where id = p_task_id and user_id = v_uid;

  return v_session;
end;
$$;

-- --- pause_timer -------------------------------------------------------------
create or replace function public.pause_timer(
  p_focus_session_id uuid,
  p_client_action_id text
)
returns public.focus_sessions
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.focus_sessions;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  begin
    insert into public.timer_action_logs (user_id, focus_session_id, client_action_id, action_type)
    values (v_uid, p_focus_session_id, p_client_action_id, 'pause');
  exception when unique_violation then
    select * into v_session from public.focus_sessions
    where id = p_focus_session_id and user_id = v_uid;
    return v_session;
  end;

  select * into v_session from public.focus_sessions
  where id = p_focus_session_id and user_id = v_uid
  for update;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;
  if v_session.status <> 'running' then
    raise exception 'Session is not running';
  end if;

  update public.focus_sessions
  set status = 'paused',
      accumulated_seconds = accumulated_seconds
        + floor(extract(epoch from (now() - last_resumed_at)))::int,
      last_resumed_at = null
  where id = p_focus_session_id and user_id = v_uid
  returning * into v_session;

  return v_session;
end;
$$;

-- --- resume_timer ------------------------------------------------------------
create or replace function public.resume_timer(
  p_focus_session_id uuid,
  p_client_action_id text
)
returns public.focus_sessions
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.focus_sessions;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  begin
    insert into public.timer_action_logs (user_id, focus_session_id, client_action_id, action_type)
    values (v_uid, p_focus_session_id, p_client_action_id, 'resume');
  exception when unique_violation then
    select * into v_session from public.focus_sessions
    where id = p_focus_session_id and user_id = v_uid;
    return v_session;
  end;

  select * into v_session from public.focus_sessions
  where id = p_focus_session_id and user_id = v_uid
  for update;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;
  if v_session.status <> 'paused' then
    raise exception 'Session is not paused';
  end if;

  update public.focus_sessions
  set status = 'running',
      last_resumed_at = now()
  where id = p_focus_session_id and user_id = v_uid
  returning * into v_session;

  return v_session;
end;
$$;

-- --- end_timer ---------------------------------------------------------------
create or replace function public.end_timer(
  p_focus_session_id uuid,
  p_client_action_id text
)
returns public.focus_sessions
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.focus_sessions;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  begin
    insert into public.timer_action_logs (user_id, focus_session_id, client_action_id, action_type)
    values (v_uid, p_focus_session_id, p_client_action_id, 'end');
  exception when unique_violation then
    select * into v_session from public.focus_sessions
    where id = p_focus_session_id and user_id = v_uid;
    return v_session;
  end;

  select * into v_session from public.focus_sessions
  where id = p_focus_session_id and user_id = v_uid
  for update;

  if v_session.id is null then
    raise exception 'Session not found';
  end if;
  if v_session.status not in ('running', 'paused') then
    raise exception 'Session is not active';
  end if;

  -- Bank the current running segment (paused sessions have no open segment).
  update public.focus_sessions
  set status = 'completed',
      accumulated_seconds = accumulated_seconds
        + case
            when last_resumed_at is not null
              then floor(extract(epoch from (now() - last_resumed_at)))::int
            else 0
          end,
      last_resumed_at = null,
      ended_at = now()
  where id = p_focus_session_id and user_id = v_uid
  returning * into v_session;

  -- NOTE: deliberately does NOT change the parent task status. Ending a focus
  -- session is separate from marking a task complete.

  return v_session;
end;
$$;

-- Allow authenticated users to call the RPCs.
grant execute on function public.start_timer(uuid, text) to authenticated;
grant execute on function public.pause_timer(uuid, text) to authenticated;
grant execute on function public.resume_timer(uuid, text) to authenticated;
grant execute on function public.end_timer(uuid, text) to authenticated;
