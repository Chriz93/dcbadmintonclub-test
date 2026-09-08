begin;
-- Ordinary score entry is write-once. Audited administrator correction remains available.
create or replace function club_app.submit_score(c uuid,m uuid,a int,b int,expected_revision int) returns int language plpgsql security definer set search_path='' as $$ declare sid uuid; game club_app.matches;begin
 if expected_revision is null or expected_revision<0 then raise exception 'Valid revision required';end if;
 if not club_app.is_scorekeeper(c) then raise exception 'Forbidden' using errcode='42501';end if;
 select session_id into sid from club_app.matches where club_id=c and id=m;
 perform 1 from club_app.sessions where club_id=c and id=sid for update;
 select * into game from club_app.matches where club_id=c and id=m for update;
 if game.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if game.score_a is not null or game.score_b is not null then raise exception 'Recorded scores require administrator correction with a reason';end if;
 return club_app.submit_score_impl(c,m,a,b,expected_revision);
end $$;
-- Signed terms are immutable within a season. Fail before changing paid eligibility.
alter function club_app.publish_agreement(uuid,uuid,text,text,int) rename to publish_agreement_unsigned_impl;
revoke all on function club_app.publish_agreement_unsigned_impl(uuid,uuid,text,text,int) from public,anon,authenticated,service_role;
create function club_app.publish_agreement(c uuid,s uuid,liability_text text,review_reference text,expected_version int) returns uuid language plpgsql security definer set search_path='' as $$ begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform 1 from club_app.clubs where id=c for update;
 perform 1 from club_app.seasons where club_id=c and id=s for update;
 if exists(select 1 from club_app.signature_receipts where club_id=c and season_id=s) then raise exception 'This season already has signatures; signed terms cannot be republished';end if;
 return club_app.publish_agreement_unsigned_impl(c,s,liability_text,review_reference,expected_version);
end $$;
revoke all on function club_app.publish_agreement(uuid,uuid,text,text,int) from public,anon,authenticated,service_role;
grant execute on function club_app.publish_agreement(uuid,uuid,text,text,int) to authenticated;
-- Keep import session locks; remove its unnecessary season write lock to avoid inversion
-- against score correction/completion. Existing cancellation must use policy-aware RPC.
create or replace function club_app.import_permit(c uuid,season uuid,venue uuid,permit_number text,source_name text,sha256 text,rows jsonb,expected_active int,expected_hours numeric,confirmed boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare imported uuid; row jsonb; active_count int; hours numeric; existing club_app.sessions; start_time timestamptz; end_time timestamptz; new_status text; user_row record;
begin
 if expected_active is null or expected_active<0 or expected_hours is null or expected_hours<0 then raise exception 'Confirmed totals required';end if;
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if confirmed is not true or jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 200 or length(source_name) not between 1 and 200 or length(permit_number) not between 1 and 100 or sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Confirmed valid provenance and preview required';end if;
 perform 1 from club_app.seasons where club_id=c and id=season;if not found or not exists(select 1 from club_app.venues where club_id=c and id=venue) then raise exception 'Invalid tenant season/venue';end if;
 select count(*) filter(where value->>'status'='active'),sum(case when value->>'status'='active' then extract(epoch from ((value->>'ends_at')::timestamptz-(value->>'starts_at')::timestamptz))/3600 else 0 end) into active_count,hours from jsonb_array_elements(rows);
 if active_count<>expected_active or hours<>expected_hours then raise exception 'Permit totals do not match confirmed preview';end if;
 if jsonb_array_length(rows)<>(select count(distinct value->>'starts_at') from jsonb_array_elements(rows)) then raise exception 'Duplicate dates in preview';end if;
 select id into imported from club_app.permit_imports p where p.club_id=c and p.sha256=import_permit.sha256 and preview=rows and confirmed_at is not null limit 1;if found then return imported;end if;
 insert into club_app.permit_imports(club_id,permit_number,source_name,sha256,preview,confirmed_by,confirmed_at) values(c,permit_number,source_name,sha256,rows,auth.uid(),now()) returning id into imported;
 for row in select value from jsonb_array_elements(rows) loop
  start_time=(row->>'starts_at')::timestamptz;end_time=(row->>'ends_at')::timestamptz;
  if coalesce(row->>'status','') not in ('active','cancelled') or start_time is null or end_time is null or end_time<=start_time then raise exception 'Invalid booking';end if;
  new_status=case when row->>'status'='active' then 'scheduled' else 'cancelled' end;
  select * into existing from club_app.sessions where club_id=c and season_id=season and venue_id=venue and starts_at=start_time for update;
  if found then
   if existing.status<>new_status then raise exception 'Use session cancellation controls; permit import cannot cancel or reopen existing sessions';end if;
   if existing.status in ('active','completed') and (existing.ends_at<>end_time or existing.status<>new_status) then raise exception 'Cannot overwrite an active/completed booking';end if;
   if existing.status<>new_status or existing.ends_at<>end_time then
    update club_app.sessions set status=new_status,ends_at=end_time,revision=revision+1,permit_id=imported where id=existing.id;
    for user_row in select user_id from club_app.memberships where club_id=c and status='active' loop perform club_app.enqueue(c,user_row.user_id,'schedule:'||existing.id||':'||(existing.revision+1)||':'||user_row.user_id,'session.changed',jsonb_build_object('session',existing.id));end loop;
   end if;
  else
   insert into club_app.sessions(club_id,season_id,venue_id,permit_id,starts_at,ends_at,rsvp_deadline,capacity,status) select c,season,venue,imported,start_time,end_time,start_time-interval '2 hours',regular_capacity,new_status from club_app.seasons where id=season;
  end if;
 end loop;
 insert into club_app.audit_events(club_id,actor,action,after_value) values(c,auth.uid(),'permit.imported',jsonb_build_object('permit',imported,'bookings',jsonb_array_length(rows)));return imported;
end $$;
-- A school cancellation supersedes pending cash refunds. Already settled money remains
-- historical evidence for manual reconciliation; never claim a bank transfer was reversed.
alter function club_app.cancel_session(uuid,uuid,int) rename to cancel_session_accounts_impl;
revoke all on function club_app.cancel_session_accounts_impl(uuid,uuid,int) from public,anon,authenticated,service_role;
create function club_app.cancel_session(c uuid,s uuid,expected_revision int) returns void language plpgsql security definer set search_path='' as $$ begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform club_app.cancel_session_accounts_impl(c,s,expected_revision);
 if exists(select 1 from club_app.sessions ss join club_app.seasons se on se.id=ss.season_id where ss.id=s and ss.club_id=c and se.rules->>'operationsEnabled'='true') then
 update club_app.session_accounts set status='void',revision=revision+1,updated_at=now() where club_id=c and session_id=s and kind='absence_refund' and status='pending';
 insert into club_app.session_accounts(club_id,session_id,user_id,kind,shuttles)
 select c,s,r.user_id,'shuttle_credit',2 from club_app.sessions ss join club_app.registrations r on r.club_id=ss.club_id and r.season_id=ss.season_id join club_app.memberships m on m.club_id=r.club_id and m.user_id=r.user_id where ss.club_id=c and ss.id=s and r.status='approved' and m.kind='regular' on conflict do nothing;
 end if;
end $$;
revoke all on function club_app.cancel_session(uuid,uuid,int) from public,anon,authenticated,service_role;
grant execute on function club_app.cancel_session(uuid,uuid,int) to authenticated;
-- Never send stale queue backlog after a session has started or after 24 hours.
alter function club_app.claim_delivery_batch(int,text[]) rename to claim_delivery_batch_smtp_impl;
revoke all on function club_app.claim_delivery_batch_smtp_impl(int,text[]) from public,anon,authenticated,service_role;
create function club_app.claim_delivery_batch(batch_size int,channels text[]) returns setof club_app.notification_deliveries language plpgsql security definer set search_path='' as $$ begin
 update club_app.notification_deliveries d set status='suppressed',failure_reason='Notification expired before sending',lease_until=null where d.status='pending' and (d.created_at<now()-interval '24 hours' or exists(select 1 from club_app.sessions s where s.id::text=d.payload->>'session' and s.club_id=d.club_id and s.starts_at<=now()));
 return query select * from club_app.claim_delivery_batch_smtp_impl(batch_size,channels);
end $$;
revoke all on function club_app.claim_delivery_batch(int,text[]) from public,anon,authenticated,service_role;
grant execute on function club_app.claim_delivery_batch(int,text[]) to service_role;
commit;
