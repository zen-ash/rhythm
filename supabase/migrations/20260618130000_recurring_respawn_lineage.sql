-- =============================================================================
-- Phase 17 hotfix — recurring respawn lineage / per-occurrence duplicate guard
--
-- Bug: the original guard checked (user, title, rule, next_date), so two
-- distinct recurring tasks that happen to share title+rule+date could only ever
-- spawn ONE shared next occurrence between them.
--
-- Fix: track lineage per source occurrence via spawned_from_task_id, and guard
-- on that id instead of on the title. Each completed occurrence may spawn at
-- most one child; separate same-title tasks each spawn their own.
-- =============================================================================

alter table public.tasks
  add column spawned_from_task_id uuid
    references public.tasks (id) on delete set null;

comment on column public.tasks.spawned_from_task_id is
  'Lineage: the task occurrence whose completion spawned this one (respawn pattern). NULL for tasks created directly by the user.';

-- Hard DB guarantee: a given source occurrence can have at most one spawned
-- child. Partial so the many NULLs (user-created tasks) are unconstrained.
create unique index tasks_spawned_from_task_id_key
  on public.tasks (spawned_from_task_id)
  where spawned_from_task_id is not null;

-- -----------------------------------------------------------------------------
-- Replace the trigger function: guard by lineage (new.id), not title/date/rule.
-- -----------------------------------------------------------------------------
create or replace function public.spawn_recurring_task()
returns trigger
language plpgsql
as $$
declare
  next_date date;
begin
  -- Only on a real transition INTO 'completed' for a recurring task. The
  -- transition guard makes double-taps, Server Action retries and outbox
  -- replays no-ops (completed -> completed never spawns).
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and new.recurrence_rule in ('daily', 'weekly') then

    next_date := case new.recurrence_rule
      when 'daily'  then new.scheduled_date + 1
      when 'weekly' then new.scheduled_date + 7
    end;

    -- Per-occurrence idempotency: this specific task may spawn at most one child.
    -- (The unique partial index enforces the same under concurrency.)
    if not exists (
      select 1
      from public.tasks t
      where t.spawned_from_task_id = new.id
    ) then
      insert into public.tasks (
        user_id, title, description, status,
        scheduled_date, recurrence_rule, sort_order, completed_at,
        spawned_from_task_id
      )
      values (
        new.user_id, new.title, new.description, 'todo',
        next_date, new.recurrence_rule, new.sort_order, null,
        new.id
      );
    end if;
  end if;

  return new;
end;
$$;

comment on function public.spawn_recurring_task() is
  'Respawn pattern: when a recurring task transitions into completed, insert exactly one next occurrence (+1 day daily / +7 days weekly). Idempotent per source occurrence via spawned_from_task_id (guarded by NOT EXISTS + a unique partial index), so separate same-title tasks each spawn their own next occurrence.';
