-- Starter set of non-Malaysian universities for the first four expansion
-- markets (US, UK, Canada, Australia). These are just a handful of large,
-- widely-recognized institutions per country to unblock testing the
-- end-to-end flow (signup -> pick country -> pick university -> upload
-- calendar PDF/image -> self-publish, same path already used by every
-- non-UiTM Malaysian university). NOT a market-researched target list —
-- add/remove/edit any of these anytime afterward from admin-web's
-- Universities page (backed by this same table), no migration needed for
-- future additions.
--
-- Uses `on conflict (id) do nothing` — safe to re-run, and never touches
-- any existing (Malaysian) row. login_method is 'manual' for all of these:
-- there is no portal auto-sync for any university except UiTM (see
-- university-connect.tsx), so students at these institutions use the
-- upload-a-PDF/image-and-extract flow, identical to non-UiTM Malaysian
-- universities today.

insert into public.universities (id, name, country, login_method, request_method, required_params)
values
  ('asu',        'Arizona State University',        'US', 'manual', 'GET', '[]'::jsonb),
  ('osu',        'Ohio State University',            'US', 'manual', 'GET', '[]'::jsonb),
  ('ucf',        'University of Central Florida',    'US', 'manual', 'GET', '[]'::jsonb),
  ('manchester', 'University of Manchester',         'GB', 'manual', 'GET', '[]'::jsonb),
  ('leeds',      'University of Leeds',              'GB', 'manual', 'GET', '[]'::jsonb),
  ('coventry',   'Coventry University',              'GB', 'manual', 'GET', '[]'::jsonb),
  ('toronto',    'University of Toronto',            'CA', 'manual', 'GET', '[]'::jsonb),
  ('york_ca',    'York University',                  'CA', 'manual', 'GET', '[]'::jsonb),
  ('tmu',        'Toronto Metropolitan University',  'CA', 'manual', 'GET', '[]'::jsonb),
  ('melbourne',  'University of Melbourne',          'AU', 'manual', 'GET', '[]'::jsonb),
  ('monash',     'Monash University',                'AU', 'manual', 'GET', '[]'::jsonb),
  ('rmit',       'RMIT University',                  'AU', 'manual', 'GET', '[]'::jsonb)
on conflict (id) do nothing;
