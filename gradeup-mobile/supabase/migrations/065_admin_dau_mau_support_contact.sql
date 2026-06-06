-- Add contact_info to support_reports
alter table public.support_reports add column if not exists contact_info text;

-- Add last_active_at to profiles for accurate DAU/MAU tracking
alter table public.profiles add column if not exists last_active_at timestamptz default now();

-- Update dashboard overview to include DAU and MAU from profiles
create or replace function public.admin_dashboard_overview()
returns jsonb
language plpgsql
security definer
as $$
declare
  out jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  out := jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'dau', (select count(*) from public.profiles where last_active_at >= now() - interval '24 hours'),
    'mau', (select count(*) from public.profiles where last_active_at >= now() - interval '30 days'),
    'total_universities', (select count(*) from public.universities),

    -- Distinct "programme courses" selected by users
    'total_courses', (select count(distinct subject_id) from public.user_courses),

    'total_timetables', (select count(*) from public.timetable_entries)
  );

  return out;
end;
$$;
