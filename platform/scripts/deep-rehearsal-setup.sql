-- TEST project wgolevihkvmosajumzvl ONLY. Synthetic namespace; aborts if already present.
-- No real payment, consent, legal signature, email or SMS is represented by these fixtures.
begin;
create function pg_temp.rehearsal_id(k int,n int default 1) returns uuid language sql immutable as $$
 select ('f0260908-'||lpad(k::text,4,'0')||'-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
do $$
declare c uuid=pg_temp.rehearsal_id(1); se uuid=pg_temp.rehearsal_id(2); s uuid=pg_temp.rehearsal_id(3); v uuid=pg_temp.rehearsal_id(4); u uuid; op uuid; owner_id uuid; i int; ordered uuid[]='{}'; w club_app.waiver_versions; before_hash text; after_hash text;
begin
 if exists(select 1 from club_app.clubs where id=c) then raise exception 'Rehearsal already exists; do not overwrite';end if;
 select m.id into strict owner_id from club_app.members m where lower(m.email)='christygeorge993@gmail.com' and exists(select 1 from club_app.memberships x where x.user_id=m.id and x.role='club_owner' and x.status='active');
 select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'')) into before_hash from club_app.sessions x;
 insert into club_app.clubs(id,slug,name) values(c,'test-deep-rehearsal-20260908','TEST ONLY — September 8 rehearsal');
 insert into club_app.seasons(id,club_id,name,regular_capacity,rules) values(se,c,'Synthetic 25-player match day',25,'{"operationsEnabled":true,"requireIntake":true,"normalTarget":21,"fiveTarget":15}');
 insert into club_app.venues(id,club_id,name,address,rooms) values(v,c,'Synthetic gym','TEST ONLY','Six courts');
 insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values(s,c,se,v,now()-interval '15 minutes',now()+interval '105 minutes',now()-interval '1 hour',25);
 for i in 1..6 loop insert into club_app.courts(id,club_id,venue_id,number) values(pg_temp.rehearsal_id(7,i),c,v,i);end loop;
 for i in 1..2 loop
  u=pg_temp.rehearsal_id(6,i);
  insert into auth.users(id,email,email_confirmed_at) values(u,'deep-operator-'||i||'@example.invalid',now());
  insert into club_app.members(id,display_name,email) values(u,'TEST Operator '||i,'deep-operator-'||i||'@example.invalid');
  insert into club_app.memberships(club_id,user_id,role,status) values(c,u,'club_admin','active');
 end loop;
 insert into club_app.memberships(club_id,user_id,role,status) values(c,owner_id,'club_owner','active');
 op=pg_temp.rehearsal_id(6,1);
 perform set_config('request.jwt.claim.sub',op::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'aal','aal2')::text,true);
 perform club_app.publish_agreement(c,se,repeat('TEST ONLY. Fictitious rehearsal agreement. Not a real waiver or legal review. ',4),'Synthetic fixture only',0);
 select * into strict w from club_app.waiver_versions where club_id=c;
 for i in 1..25 loop
  u=pg_temp.rehearsal_id(5,i);ordered=array_append(ordered,u);
  insert into auth.users(id,email,email_confirmed_at) values(u,'deep-player-'||i||'@example.invalid',now());
  insert into club_app.members(id,display_name,email) values(u,'TEST Player '||lpad(i::text,2,'0'),'deep-player-'||i||'@example.invalid');
  insert into club_app.memberships(club_id,user_id,role,status) values(c,u,case when i<=6 then 'scorekeeper' else 'member' end,'active');
  insert into club_app.registrations(club_id,season_id,user_id,status) values(c,se,u,'pending');
  insert into club_app.member_intake(club_id,season_id,user_id,legal_name,kind,emergency_contact,payment_status,claimed_amount_cents) values(c,se,u,'TEST Player '||lpad(i::text,2,'0'),'regular','Synthetic emergency contact','verified',40000);
  perform set_config('request.jwt.claim.sub',u::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'aal','aal1')::text,true);
  perform club_app.save_eligibility(c,se,'1990-01-01',null,0,true);
  perform club_app.sign_agreement(c,se,u,w.id,w.sha256,'TEST Player '||i,null,true,true);
  op=pg_temp.rehearsal_id(6,1+(i%2));
  perform set_config('request.jwt.claim.sub',op::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',op,'aal','aal2')::text,true);
  perform club_app.review_eligibility(c,se,u,1,null,'Synthetic independent identity review',true);
  perform club_app.approve_member(c,se,u);
 end loop;
 perform club_app.set_seeding(c,se,ordered,0,'Synthetic organizer initial order');
 select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'')) into after_hash from club_app.sessions x where x.club_id<>c;
 if before_hash<>after_hash then raise exception 'Existing session records changed';end if;
end $$;
commit;
select (select count(*) from club_app.registrations where club_id='f0260908-0001-4000-8000-000000000001' and status='approved') approved_players,
 (select count(*) from club_app.signature_receipts where club_id='f0260908-0001-4000-8000-000000000001') synthetic_receipts,
 (select count(*) from club_app.initial_seeds where club_id='f0260908-0001-4000-8000-000000000001') seeded_players,
 (select count(*) from club_app.matches where club_id='f0260908-0001-4000-8000-000000000001') games,
 (select count(*) from club_app.notification_preferences where club_id='f0260908-0001-4000-8000-000000000001' and enabled) delivery_consents;
