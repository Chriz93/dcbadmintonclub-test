-- T02: on TEST only, new sign-ups see waiver version 2026-09-v2 (the revised draft) so it can be reviewed there.
-- Production keeps 2026-09-v1 until an Ontario lawyer has reviewed v2 and the organizer approves (docs/28).
begin;
select public.assert_test_environment();
update public.waiver_versions set is_current=false where is_current and version<>'2026-09-v2';
update public.waiver_versions set is_current=true where version='2026-09-v2';
update public.environment set schema_version='L20';
commit;
select version,is_current from public.waiver_versions order by version;
