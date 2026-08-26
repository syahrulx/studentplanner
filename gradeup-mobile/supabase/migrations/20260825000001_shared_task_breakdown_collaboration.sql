-- Group-project breakdown collaboration.
-- IMPORTANT: This additive migration is intentionally not applied automatically.
-- It does not delete or rewrite existing user tasks or shared-task rows.

alter table public.tasks
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

create index if not exists tasks_parent_assignee_idx
  on public.tasks (parent_task_id, assigned_to)
  where parent_task_id is not null;

comment on column public.tasks.assigned_to is
  'Optional collaborator assigned by the owner to a breakdown step.';

create or replace function public.validate_breakdown_assignee()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.assigned_to is null then return new; end if;
  if new.parent_task_id is null then
    raise exception 'Only breakdown steps can have an assignee';
  end if;
  if new.assigned_to = new.user_id then return new; end if;
  if not exists (
    select 1 from public.shared_tasks st
    where st.task_id = new.parent_task_id
      and st.owner_id = new.user_id
      and st.recipient_id = new.assigned_to
      and st.status = 'accepted'
  ) then
    raise exception 'Assignee is not an accepted member of this task';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_validate_breakdown_assignee on public.tasks;
create trigger tasks_validate_breakdown_assignee
before insert or update of assigned_to, parent_task_id on public.tasks
for each row execute function public.validate_breakdown_assignee();

-- Accepted members can read only child steps belonging to the exact parent
-- task shared with them. Owner CRUD policies remain unchanged.
drop policy if exists "Accepted members can view shared breakdown steps" on public.tasks;
create policy "Accepted members can view shared breakdown steps"
  on public.tasks for select
  to authenticated
  using (
    parent_task_id is not null
    and exists (
      select 1
      from public.shared_tasks st
      where st.task_id = tasks.parent_task_id
        and st.owner_id = tasks.user_id
        and st.recipient_id = auth.uid()
        and st.status = 'accepted'
    )
  );

create or replace function public.set_breakdown_step_assignee(
  p_step_task_id text,
  p_assignee_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_parent text;
begin
  if v_owner is null then raise exception 'Not signed in'; end if;

  select parent_task_id into v_parent
  from public.tasks
  where id = p_step_task_id and user_id = v_owner
  for update;

  if v_parent is null then raise exception 'Breakdown step not found'; end if;

  if p_assignee_id is not null and p_assignee_id <> v_owner and not exists (
    select 1 from public.shared_tasks st
    where st.task_id = v_parent
      and st.owner_id = v_owner
      and st.recipient_id = p_assignee_id
      and st.status = 'accepted'
  ) then
    raise exception 'Assignee is not an accepted member of this task';
  end if;

  update public.tasks
  set assigned_to = p_assignee_id
  where id = p_step_task_id and user_id = v_owner;
end;
$$;

create or replace function public.set_shared_breakdown_step_completion(
  p_step_task_id text,
  p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_parent text;
  v_assignee uuid;
begin
  if v_actor is null then raise exception 'Not signed in'; end if;

  select user_id, parent_task_id, assigned_to
  into v_owner, v_parent, v_assignee
  from public.tasks
  where id = p_step_task_id
    and (user_id = v_actor or assigned_to = v_actor)
  for update;

  if v_parent is null then raise exception 'Breakdown step not found'; end if;
  if v_actor <> v_owner and v_actor is distinct from v_assignee then
    raise exception 'Only the owner or assigned member can complete this step';
  end if;
  if v_actor <> v_owner and not exists (
    select 1 from public.shared_tasks st
    where st.task_id = v_parent
      and st.owner_id = v_owner
      and st.recipient_id = v_actor
      and st.status = 'accepted'
  ) then
    raise exception 'You are no longer a member of this task';
  end if;

  update public.tasks
  set is_done = coalesce(p_completed, false)
  where id = p_step_task_id and user_id = v_owner;
end;
$$;

create or replace function public.remove_task_collaborator(
  p_parent_task_id text,
  p_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Not signed in'; end if;
  if not exists (
    select 1 from public.tasks
    where id = p_parent_task_id and user_id = v_owner and parent_task_id is null
  ) then
    raise exception 'Task not found or you are not its owner';
  end if;

  -- Never delete task content. Removing a member only clears their assignment
  -- and their own share link for this exact parent task.
  update public.tasks
  set assigned_to = null
  where user_id = v_owner
    and parent_task_id = p_parent_task_id
    and assigned_to = p_member_id;

  delete from public.shared_tasks
  where task_id = p_parent_task_id
    and owner_id = v_owner
    and recipient_id = p_member_id;
end;
$$;

revoke all on function public.set_breakdown_step_assignee(text, uuid) from public;
revoke all on function public.set_shared_breakdown_step_completion(text, boolean) from public;
revoke all on function public.remove_task_collaborator(text, uuid) from public;
grant execute on function public.set_breakdown_step_assignee(text, uuid) to authenticated;
grant execute on function public.set_shared_breakdown_step_completion(text, boolean) to authenticated;
grant execute on function public.remove_task_collaborator(text, uuid) to authenticated;

-- Enable task change events for live group progress. The guarded block is safe
-- when tasks was already added to the publication in another environment.
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;
end $$;
