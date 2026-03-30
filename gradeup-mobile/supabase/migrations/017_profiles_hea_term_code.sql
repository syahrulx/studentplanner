-- Store which HEA semester/term code (e.g. 20262) the user is following.

alter table public.profiles
  add column if not exists hea_term_code text;

comment on column public.profiles.hea_term_code is
  'UiTM HEA academic calendar term/semester code (e.g. 20254, 20262) used to select the correct calendar segment.';

