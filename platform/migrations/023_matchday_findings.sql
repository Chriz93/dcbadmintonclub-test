begin;
-- Administration-only accounts must not appear as provisional players.
alter function club_app.rebuild_elo(uuid,uuid) rename to rebuild_elo_all_members_impl;
revoke all on function club_app.rebuild_elo_all_members_impl(uuid,uuid) from public,anon,authenticated,service_role;
create function club_app.rebuild_elo(c uuid,se uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform club_app.rebuild_elo_all_members_impl(c,se);
 if exists(select 1 from club_app.seasons where club_id=c and id=se and rules->>'operationsEnabled'='true') then
 delete from club_app.elo_ratings e where e.club_id=c and e.season_id=se and e.played=0 and not exists(select 1 from club_app.registrations r where r.club_id=c and r.season_id=se and r.user_id=e.user_id and r.status='approved' and exists(select 1 from club_app.signature_receipts sr where sr.club_id=c and sr.season_id=se and sr.participant_id=e.user_id));
 end if;
end $$;
revoke all on function club_app.rebuild_elo(uuid,uuid) from public,anon,authenticated,service_role;
-- Players see live court changes in the app. Four rounds would otherwise produce
-- 100 emails for 25 players, exhausting the free daily budget before reminders.
alter function club_app.enqueue(uuid,uuid,text,text,jsonb) rename to enqueue_channels_impl;
revoke all on function club_app.enqueue_channels_impl(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
create function club_app.enqueue(c uuid,u uuid,k text,t text,p jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
 if t='assignment.changed' then return;end if;
 perform club_app.enqueue_channels_impl(c,u,k,t,p);
end $$;
revoke all on function club_app.enqueue(uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
-- Safe derived-data repair only; historical results and signatures are retained.
delete from club_app.elo_ratings e using club_app.seasons s where s.id=e.season_id and s.club_id=e.club_id and s.rules->>'operationsEnabled'='true' and e.played=0 and not exists(select 1 from club_app.registrations r where r.club_id=e.club_id and r.season_id=e.season_id and r.user_id=e.user_id and r.status='approved' and exists(select 1 from club_app.signature_receipts sr where sr.club_id=r.club_id and sr.season_id=r.season_id and sr.participant_id=r.user_id));
create or replace function club_app.agreement_terms() returns text language sql immutable set search_path='' as $$ select E'Organizer: Christy, acting personally. Maplewood Advanced Badminton League is the league name, not a separately registered club.\nRegular season fee: $400; approved spare session: $20. A payment claim is not proof of payment. Spare places are confirmed only after voting, verified payment and availability.\nEligible absence refund: $14 for notice received at least 72 elapsed hours before the session starts. Late notice and no-shows are not eligible.\nSchool/facility cancellations: no cash refund; two physical shuttlecocks credited per affected eligible player.\nVerified no-show: one court down, with administrator review and correction. No response alone is not proof of a no-show.\nChristy sets initial seeding. Ratings and court movement follow published rules; administrators may make audited corrections.\nBookings 20:15–22:15 Toronto time: no early entry, finish play by 22:05 and leave by 22:15. Indoor non-marking shoes and school facility conditions apply.\nPlayers aged 16–17 require verified parent/legal-guardian consent. Adult participants sign for themselves.\nRegistration and acceptance are season-specific. A new season requires its own signed agreement; earlier receipts remain on record.\n' $$;
commit;
