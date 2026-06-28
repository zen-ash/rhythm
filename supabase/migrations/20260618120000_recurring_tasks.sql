-- =============================================================================
-- Phase 17 — Recurring tasks (the respawn pattern)
--
-- Adds a nullable recurrence_rule to tasks plus a trigger that, when a recurring
-- task is completed, spawns EXACTLY ONE next occurrence (+1 day daily / +7 days
-- weekly). No future rows are pre-generated; no separate table. RLS is unchanged
-- (owner-only) — the trigger runs as the invoking user, so the new row is owned
-- by that same user and the existing insert policy still applies.
-- =============================================================================

alter table public.tasks
  add column recurrence_rule text;

alter table public.tasks
  add constraint tasks_recurrence_rule_check
  check (recurrence_rule is null or recurrence_rule in ('daily', 'weekly'));

comment on column public.tasks.recurrence_rule is
  'NULL = one-off. ''daily''/''weekly'' = on completion, spawn one next occurrence (+1 / +7 days). Respawn pattern: never pre-generate future rows.';

-- -----------------------------------------------------------------------------
-- Respawn trigger
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

    -- Belt-and-suspenders idempotency: never create a second open occurrence for
    -- the same series + target day (also covers uncomplete/recomplete).
    if not exists (
      select 1
      from public.tasks t
      where t.user_id = new.user_id
        and t.recurrence_rule = new.recurrence_rule
        and t.title = new.title
        and t.scheduled_date = next_date
        and t.status <> 'completed'
    ) then
      insert into public.tasks (
        user_id, title, description, status,
        scheduled_date, recurrence_rule, sort_order, completed_at
      )
      values (
        new.user_id, new.title, new.description, 'todo',
        next_date, new.recurrence_rule, new.sort_order, null
      );
    end if;
  end if;

  return new;
end;
$$;

comment on function public.spawn_recurring_task() is
  'Respawn pattern: when a recurring task transitions into completed, insert exactly one next occurrence (+1 day daily / +7 days weekly), guarded against duplicates.';

create trigger trg_spawn_recurring_task
  after update on public.tasks
  for each row
  execute function public.spawn_recurring_task();
