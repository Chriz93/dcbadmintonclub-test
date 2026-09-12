-- L21 (September 12, 2026): exact privileges on the tables added by L18 and L20, for TEST and production alike.
-- L18 and L20 revoked everything from visitors and signed-in users but not from the service role, so Supabase's defaults
-- left the service role REFERENCES, TRIGGER and TRUNCATE on environment, waiver_versions and waiver_acceptances (found by
-- verify.sql on TEST: "no TRUNCATE for site roles: FAIL: 3"). Row rules and row triggers do not cover TRUNCATE.
-- Same pattern as L15 and L17: revoke everything, then grant back reading only (the organizer through the row rules; the
-- daily backup through the service role). Writes stay inside the security-definer functions from L18 and L20.
begin;
revoke all on public.environment,public.waiver_versions,public.waiver_acceptances from public,anon,authenticated,service_role;
grant select on public.environment,public.waiver_versions,public.waiver_acceptances to authenticated,service_role;
update public.environment set schema_version='L21';
end;
