-- Premium handwriting notebooks. Existing typed/PDF notes are unchanged.

alter table public.notes
  add column if not exists note_type text not null default 'text';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notes_note_type_check'
  ) then
    alter table public.notes
      add constraint notes_note_type_check
      check (note_type in ('text', 'handwriting'));
  end if;
end $$;

-- Editable ink layers are stored beside each PDF/note in the existing private
-- note-attachments bucket. This keeps deployment additive and avoids a second
-- note-data table; existing per-user storage policies continue to apply.

insert into public.subscription_plan_features (tier, label, enabled, sort_order)
select 'plus', 'Handwritten notebooks & PDF annotation with Apple Pencil and tablet stylus support', true, 11
where not exists (
  select 1 from public.subscription_plan_features
  where tier = 'plus' and label ilike 'Handwritten notebooks%'
);

insert into public.subscription_plan_features (tier, label, enabled, sort_order)
select 'pro', 'Pro handwriting templates including Cornell notes and dark paper', true, 10
where not exists (
  select 1 from public.subscription_plan_features
  where tier = 'pro' and label ilike 'Pro handwriting templates%'
);
