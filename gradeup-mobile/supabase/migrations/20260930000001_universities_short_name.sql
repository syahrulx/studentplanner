-- ==============================================================================
-- 20260930000001_universities_short_name.sql
-- Description: Adds universities.short_name so the picker shows the real
--              abbreviation instead of one guessed from the name's initials.
--              The guess turned "Universiti Tun Abdul Razak" into "UTAR",
--              which is Universiti Tunku Abdul Rahman.
--              NULL keeps the app's old behaviour (hardcoded list, then initials).
-- ==============================================================================

ALTER TABLE public.universities
  ADD COLUMN IF NOT EXISTS short_name text;

COMMENT ON COLUMN public.universities.short_name IS
  'Abbreviation shown in the university picker (e.g. UTAR, UNIRAZAK). NULL = derive in the app.';

UPDATE public.universities u
SET short_name = data.short_name
FROM (VALUES
  ('utar',           'UTAR'),
  ('unirazak',       'UNIRAZAK'),
  ('ucsi',           'UCSI'),
  ('imu',            'IMU'),
  ('ican',           'ICAN'),
  ('klt',            'KLT'),
  ('iic',            'IIC'),
  ('iuc',            'IUC'),
  ('sunway-college', 'Sunway College'),
  ('unimap',         'UniMAP')
) AS data(id, short_name)
WHERE u.id = data.id;
