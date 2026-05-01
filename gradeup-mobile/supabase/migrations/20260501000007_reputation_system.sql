-- =============================================================================
-- 20260501000007: Reputation System
-- =============================================================================
-- Adds average_rating and total_reviews to the profiles table, and 
-- automatically recalculates them when a new service review is submitted.

-- 1. Add columns to profiles
alter table public.profiles
  add column if not exists average_rating numeric(3,2) default null,
  add column if not exists total_reviews int not null default 0;

-- 2. Create the recalculation function
create or replace function public.recalculate_user_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  new_avg numeric(3,2);
  new_total int;
begin
  if TG_OP = 'DELETE' then
    target_user := old.reviewee_id;
  else
    target_user := new.reviewee_id;
  end if;

  select coalesce(avg(rating)::numeric(3,2), null), count(*)
    into new_avg, new_total
    from public.service_reviews
   where reviewee_id = target_user;

  update public.profiles
     set average_rating = new_avg,
         total_reviews = new_total
   where id = target_user;

  if TG_OP = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- 3. Create triggers on service_reviews
drop trigger if exists trg_recalculate_rating on public.service_reviews;
create trigger trg_recalculate_rating
after insert or update of rating or delete on public.service_reviews
for each row execute function public.recalculate_user_rating();

-- 4. Initial recalculation for any existing reviews
do $$
declare
  r record;
begin
  for r in select distinct reviewee_id from public.service_reviews loop
    update public.profiles
       set average_rating = (select avg(rating)::numeric(3,2) from public.service_reviews where reviewee_id = r.reviewee_id),
           total_reviews = (select count(*) from public.service_reviews where reviewee_id = r.reviewee_id)
     where id = r.reviewee_id;
  end loop;
end;
$$;
