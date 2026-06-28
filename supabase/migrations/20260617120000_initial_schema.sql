-- =============================================================================
-- Productivity app — initial schema (Phase 1: Supabase foundation)
--
-- Scope: tables, enums, constraints, indexes, an updated_at trigger, and
-- owner-only RLS. No timer RPCs, no auth wiring, no UI. Daily summaries are
-- computed on the fly later and are intentionally NOT stored in a table.
-- =============================================================================

-- gen_random_uuid() lives in pgcrypto. On Supabase it is usually preinstalled,
-- but enable defensively so this migration is portable.
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.task_status as enum ('todo', 'in_progress', 'completed');

create type public.focus_session_status as enum (
  'running',
  'paused',
  'completed',
  'abandoned'
);

-- -----------------------------------------------------------------------------
-- Reusable updated_at trigger function
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sets updated_at = now() on every UPDATE. Attached to profiles, tasks, focus_sessions.';

-- -----------------------------------------------------------------------------
-- profiles — app-level user data, 1:1 with auth.users
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone     text        not null default 'America/New_York',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.profiles.timezone is
  'Drives the user-local "today" boundary used by the Today page and task rollover.';

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- tasks
-- -----------------------------------------------------------------------------
create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  title          text        not null,
  description    text,
  status         public.task_status not null default 'todo',
  scheduled_date date        not null,
  completed_at   timestamptz,
  sort_order     numeric     not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint tasks_title_not_blank check (char_length(btrim(title)) > 0),
  -- Enables composite FKs from child rows so a child can never reference a task
  -- owned by a different user.
  constraint tasks_id_user_unique unique (id, user_id)
);

comment on column public.tasks.scheduled_date is
  'The user-local day this task belongs to. Drives the Today query; in-place rollover bumps this to the current day for unfinished tasks.';
comment on column public.tasks.sort_order is
  'Manual ordering within a day; numeric to allow cheap reordering between two rows.';
comment on constraint tasks_id_user_unique on public.tasks is
  'Ownership-safety: lets focus_sessions reference (id, user_id) so a session cannot be linked across users.';

-- Core Today-page lookup.
create index tasks_user_scheduled_date_idx on public.tasks (user_id, scheduled_date);
-- Status filters (e.g. find unfinished tasks for rollover).
create index tasks_user_status_idx on public.tasks (user_id, status);
-- Ordered Today list without a separate sort step.
create index tasks_user_date_sort_idx on public.tasks (user_id, scheduled_date, sort_order);

-- -----------------------------------------------------------------------------
-- focus_sessions — task-linked timers (timestamp-based, background-safe)
-- -----------------------------------------------------------------------------
create table public.focus_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid        not null references auth.users (id) on delete cascade,
  task_id             uuid        not null,
  status              public.focus_session_status not null default 'running',
  started_at          timestamptz not null default now(),
  ended_at            timestamptz,
  accumulated_seconds integer     not null default 0,
  last_resumed_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Ownership-safe link: task must belong to the same user as the session.
  constraint focus_sessions_task_fk
    foreign key (task_id, user_id) references public.tasks (id, user_id) on delete cascade,
  constraint focus_sessions_id_user_unique unique (id, user_id),
  constraint focus_sessions_accumulated_nonneg check (accumulated_seconds >= 0),
  constraint focus_sessions_end_after_start check (ended_at is null or ended_at >= started_at)
);

comment on table public.focus_sessions is
  'Timestamp-based timer safety: never store a live counter. Elapsed time is DERIVED as accumulated_seconds + (status=running ? now() - last_resumed_at : 0), so background/kill/offline cannot corrupt it.';
comment on column public.focus_sessions.accumulated_seconds is
  'Time banked from completed run segments (pauses fold the current segment into this). Excludes the currently running segment.';
comment on column public.focus_sessions.last_resumed_at is
  'Server time the current running segment started; NULL while paused/ended. Combined with now() to derive live elapsed time.';
comment on constraint focus_sessions_task_fk on public.focus_sessions is
  'Composite FK to tasks(id, user_id) so a session can never link to another user''s task.';

-- "Is there a live timer?" and per-task session history.
create index focus_sessions_user_task_idx on public.focus_sessions (user_id, task_id);
create index focus_sessions_user_status_idx on public.focus_sessions (user_id, status);

-- Enforce ONE active timer per user at the database level (not just app layer).
create unique index focus_sessions_one_active_per_user
  on public.focus_sessions (user_id)
  where status in ('running', 'paused');

comment on index public.focus_sessions_one_active_per_user is
  'DB-level guarantee of at most one active (running or paused) focus session per user.';

create trigger trg_focus_sessions_updated_at
  before update on public.focus_sessions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- timer_action_logs — append-only idempotency ledger for timer actions
-- -----------------------------------------------------------------------------
create table public.timer_action_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  focus_session_id uuid,
  client_action_id text        not null,
  action_type      text        not null,
  created_at       timestamptz not null default now(),
  constraint timer_action_logs_session_fk
    foreign key (focus_session_id, user_id)
    references public.focus_sessions (id, user_id) on delete cascade,
  -- Idempotency key: a retried start/pause/resume/end from a dropped mobile
  -- connection collides here and cannot double-apply.
  constraint timer_action_logs_user_client_action_unique unique (user_id, client_action_id)
);

comment on table public.timer_action_logs is
  'Append-only. Existence of (user_id, client_action_id) means the action was already processed; replays after connection drops are rejected by the unique constraint.';
comment on constraint timer_action_logs_user_client_action_unique on public.timer_action_logs is
  'Idempotency: one client_action_id per user is processed at most once.';

create index timer_action_logs_user_session_idx
  on public.timer_action_logs (user_id, focus_session_id);

-- =============================================================================
-- Row Level Security — owner-only on every table
-- =============================================================================
alter table public.profiles          enable row level security;
alter table public.tasks             enable row level security;
alter table public.focus_sessions    enable row level security;
alter table public.timer_action_logs enable row level security;

-- profiles: keyed on the row id (= auth user id).
create policy profiles_owner_all on public.profiles
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- tasks / focus_sessions: keyed on user_id, full owner access.
create policy tasks_owner_all on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy focus_sessions_owner_all on public.focus_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- timer_action_logs: append-oriented — SELECT + INSERT only, no UPDATE/DELETE.
create policy timer_action_logs_owner_select on public.timer_action_logs
  for select
  using (auth.uid() = user_id);

create policy timer_action_logs_owner_insert on public.timer_action_logs
  for insert
  with check (auth.uid() = user_id);
