-- ============================================================
-- Grade Calculator: subject_grade_configs
-- One row per (user_id, subject_id)
-- ============================================================

create table if not exists public.subject_grade_configs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  subject_id   text not null,

  -- Grading scheme: 'uitm' | 'generic_4' | 'generic_5' (user-configurable, defaults to 'uitm')
  grading_scheme  text not null default 'uitm',

  -- Has final exam toggle
  has_final_exam  boolean not null default true,

  -- Weight split (0-100). carry_weight + final_weight = 100
  carry_weight    numeric(5,2) not null default 40,
  final_weight    numeric(5,2) not null default 60,

  -- Assessment components (carry marks breakdown) stored as JSONB array
  -- Each element: { id, name, weight, scored, maxScore }
  assessments     jsonb not null default '[]'::jsonb,

  -- Final exam score (null = not yet entered)
  final_exam_scored    numeric(7,2),
  final_exam_max_score numeric(7,2) not null default 100,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (user_id, subject_id)
);

-- RLS
alter table public.subject_grade_configs enable row level security;

create policy "Users manage own grade configs"
  on public.subject_grade_configs
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function public.set_grade_config_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_grade_config_updated_at on public.subject_grade_configs;
create trigger trg_grade_config_updated_at
  before update on public.subject_grade_configs
  for each row execute function public.set_grade_config_updated_at();
