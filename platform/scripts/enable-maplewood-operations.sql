-- TEST wgolevihkvmosajumzvl ONLY, after migrations 012–021 and permission audit pass.
begin;
do $$ begin
 if to_regprocedure('club_app.assign_reviewed_courts(uuid,uuid,integer,jsonb,integer,text,uuid[])') is null or to_regclass('club_app.signature_receipts') is null or to_regclass('club_app.privacy_reviews') is null or to_regprocedure('club_app.unsubscribe_channel(uuid,uuid,text)') is null then raise exception 'Operations migrations are missing';end if;
 if not exists(select 1 from club_app.seasons where club_id='10000000-0000-0000-0000-000000000001' and id='40000000-0000-0000-0000-000000000001' and regular_capacity=25) then raise exception 'Expected TEST season unavailable';end if;
end $$;
update club_app.seasons set rules=rules||'{"operationsEnabled":true,"requireIntake":true,"regularFeeCents":40000,"spareFeeCents":2000,"absenceRefundCents":1400,"absenceNoticeHours":72,"facilityCashRefundCents":0,"facilityShuttleCredit":2,"noShowCourtsDown":1,"registrationClosed":true}'::jsonb where club_id='10000000-0000-0000-0000-000000000001' and id='40000000-0000-0000-0000-000000000001';
notify pgrst, 'reload schema';
commit;
