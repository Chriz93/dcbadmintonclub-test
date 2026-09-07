begin;
create function club_app.import_permit(c uuid,season uuid,venue uuid,permit_number text,source_name text,sha256 text,rows jsonb,expected_active int,expected_hours numeric,confirmed boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare imported uuid; row jsonb; active_count int; hours numeric; existing club_app.sessions; start_time timestamptz; end_time timestamptz; new_status text; user_row record;
begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if confirmed is not true or jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 200 or length(source_name) not between 1 and 200 or length(permit_number) not between 1 and 100 or sha256 !~ '^[a-f0-9]{64}$' then raise exception 'Confirmed valid provenance and preview required';end if;
 perform 1 from club_app.seasons where club_id=c and id=season for update;if not found or not exists(select 1 from club_app.venues where club_id=c and id=venue) then raise exception 'Invalid tenant season/venue';end if;
 select count(*) filter(where value->>'status'='active'),sum(case when value->>'status'='active' then extract(epoch from ((value->>'ends_at')::timestamptz-(value->>'starts_at')::timestamptz))/3600 else 0 end) into active_count,hours from jsonb_array_elements(rows);
 if active_count<>expected_active or hours<>expected_hours then raise exception 'Permit totals do not match confirmed preview';end if;
 if jsonb_array_length(rows)<>(select count(distinct value->>'starts_at') from jsonb_array_elements(rows)) then raise exception 'Duplicate dates in preview';end if;
 select id into imported from club_app.permit_imports p where p.club_id=c and p.sha256=import_permit.sha256 and preview=rows and confirmed_at is not null limit 1;if found then return imported;end if;
 insert into club_app.permit_imports(club_id,permit_number,source_name,sha256,preview,confirmed_by,confirmed_at) values(c,permit_number,source_name,sha256,rows,auth.uid(),now()) returning id into imported;
 for row in select value from jsonb_array_elements(rows) loop
  start_time=(row->>'starts_at')::timestamptz;end_time=(row->>'ends_at')::timestamptz;
  if row->>'status' not in ('active','cancelled') or start_time is null or end_time is null or end_time<=start_time then raise exception 'Invalid booking';end if;
  new_status=case when row->>'status'='active' then 'scheduled' else 'cancelled' end;
  select * into existing from club_app.sessions where club_id=c and season_id=season and venue_id=venue and starts_at=start_time for update;
  if found then
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
revoke all on function club_app.import_permit(uuid,uuid,uuid,text,text,text,jsonb,int,numeric,boolean) from public;
grant execute on function club_app.import_permit(uuid,uuid,uuid,text,text,text,jsonb,int,numeric,boolean) to authenticated;
commit;
