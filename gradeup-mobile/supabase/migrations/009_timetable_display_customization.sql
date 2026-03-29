-- Optional display overrides for imported timetable rows
alter table public.timetable_entries
  add column if not exists display_name text,
  add column if not exists slot_color text;
