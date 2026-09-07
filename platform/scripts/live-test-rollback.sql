-- Authorized TEST project only. All synthetic identities, agreements and results are rolled back.
-- This exercises live PostgreSQL RPCs with synthetic JWT claims, not real Auth token verification.
begin;
do $$
declare c uuid=gen_random_uuid(); se uuid=gen_random_uuid(); v uuid=gen_random_uuid(); s uuid=gen_random_uuid(); s2 uuid=gen_random_uuid(); se2 uuid=gen_random_uuid(); court uuid=gen_random_uuid(); users uuid[]=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]; i int; w uuid; h text; receipt uuid; game record; rev int; event_id bigint; blocked boolean;
begin
 insert into club_app.clubs(id,slug,name) values(c,'rollback-'||c,'Synthetic rollback league');
 insert into club_app.seasons(id,club_id,name,regular_capacity,rules) values(se,c,'Synthetic operations',1,'{"operationsEnabled":true,"requireIntake":true}');
 insert into club_app.venues(id,club_id,name,address,rooms) values(v,c,'Synthetic gym','Synthetic street','A');
 insert into club_app.courts(id,club_id,venue_id,number) values(court,c,v,1);
 insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values(s,c,se,v,now()+interval '5 days',now()+interval '5 days 2 hours',now()+interval '2 days',1);
 for i in 1..5 loop
 insert into auth.users(id,email,email_confirmed_at) values(users[i],'rollback-'||users[i]||'@example.invalid',now());
 insert into club_app.members(id,display_name,email) values(users[i],'Synthetic '||i,'rollback-'||users[i]||'@example.invalid');
 insert into club_app.memberships(club_id,user_id,role,status,kind) values(c,users[i],case when i=1 then 'club_admin' else 'member' end,'active',case when i=5 then 'spare' else 'regular' end);
 end loop;
 for i in 2..5 loop
 insert into club_app.registrations(club_id,season_id,user_id,status) values(c,se,users[i],case when i in (2,5) then 'approved' else 'pending' end);
 insert into club_app.member_intake(club_id,season_id,user_id,legal_name,kind,emergency_contact,payment_status,claimed_amount_cents) values(c,se,users[i],'Synthetic '||i,case when i=5 then 'spare' else 'regular' end,'Synthetic emergency','verified',40000);
 end loop;
 perform set_config('request.jwt.claim.sub',users[2]::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'aal','aal1')::text,true);
 perform club_app.submit_rsvp(c,s,users[2],'not_attending','Synthetic notice',0,gen_random_uuid());
 if not exists(select 1 from club_app.session_accounts where club_id=c and user_id=users[2] and cents=1400 and kind='absence_refund') then raise exception 'Refund test failed';end if;
 perform set_config('request.jwt.claim.sub',users[5]::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',users[5],'aal','aal1')::text,true);
 perform club_app.request_spare(c,s,'Synthetic reference',0);
 perform set_config('request.jwt.claim.sub',users[1]::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'aal','aal2')::text,true);
 if club_app.verify_spare(c,s,users[5],1,'Synthetic bank verification')<>'confirmed' then raise exception 'Spare test failed';end if;
 w=club_app.publish_agreement(c,se,repeat('Synthetic test text, not an actual legal agreement. ',4),'Synthetic rollback review',0);
 select sha256 into h from club_app.waiver_versions where id=w;
 perform set_config('request.jwt.claim.sub',users[3]::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',users[3],'aal','aal1')::text,true);
 perform club_app.save_eligibility(c,se,(current_date-interval '17 years')::date,'rollback-'||users[4]||'@example.invalid',0,true);
 blocked=false;
 begin perform club_app.sign_agreement(c,se,users[3],w,h,'Synthetic minor',null,true,true);exception when insufficient_privilege then blocked=true;end;
 if not blocked then raise exception 'Minor self-signing was not blocked';end if;
 perform set_config('request.jwt.claim.sub',users[4]::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',users[4],'aal','aal1')::text,true);
 receipt=club_app.sign_agreement(c,se,users[3],w,h,'Synthetic guardian','Parent',true,true);
 if not exists(select 1 from club_app.signature_receipts where id=receipt and signer_capacity='guardian') then raise exception 'Guardian signing failed';end if;
 perform set_config('request.jwt.claim.sub',users[1]::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'aal','aal2')::text,true);
 perform club_app.cancel_session(c,s,0);
 if not exists(select 1 from club_app.session_accounts where club_id=c and user_id=users[5] and kind='shuttle_credit' and shuttles=2 and cents=0) then raise exception 'Shuttle credit failed';end if;
 insert into club_app.seasons(id,club_id,name,regular_capacity) values(se2,c,'Synthetic match lifecycle',4);
 insert into club_app.sessions(id,club_id,season_id,venue_id,starts_at,ends_at,rsvp_deadline,capacity) values(s2,c,se2,v,now()+interval '1 day',now()+interval '1 day 2 hours',now(),4);
 perform club_app.assign_reviewed_courts(c,s2,1,jsonb_build_array(jsonb_build_object('court_id',court,'players',to_jsonb(users[1:4]))),0,'Synthetic reviewed placement',array[]::uuid[]);
 for game in select * from club_app.matches where session_id=s2 loop perform club_app.submit_score(c,game.id,21,10,0);end loop;
 select revision into rev from club_app.sessions where id=s2;
 perform club_app.complete_session(c,s2,rev);
 if (select count(*) from club_app.elo_ratings where season_id=se2 and played=3)<>4 then raise exception 'ELO lifecycle failed';end if;
 select revision into rev from club_app.sessions where id=s2;
 perform club_app.restart_round(c,s2,1,rev,(select jsonb_object_agg(id,revision) from club_app.matches where session_id=s2),'Synthetic restart test');
 select max(id) into event_id from club_app.audit_events where club_id=c and action='round.restarted';
 select revision into rev from club_app.sessions where id=s2;
 perform club_app.undo_round_restart(c,event_id,rev,'Synthetic restore test');
 if (select count(*) from club_app.matches where session_id=s2)<>3 or (select status from club_app.sessions where id=s2)<>'completed' then raise exception 'Restore failed';end if;
end $$;
rollback;
select 'PASS: refund, spare, minor denial, guardian receipt, physical shuttles, scoring, ELO and restart/undo; all synthetic rows rolled back' as live_rpc_verification;
