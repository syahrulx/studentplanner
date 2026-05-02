-- Allow dashboard admins to read and clear all service reports.
-- Without this, only SELECT own rows works — admin-web list/count/detail stay empty.

CREATE POLICY "service_reports admin select all"
ON public.service_reports
FOR SELECT
TO authenticated
USING (public.is_admin());

CREATE POLICY "service_reports admin delete all"
ON public.service_reports
FOR DELETE
TO authenticated
USING (public.is_admin());
