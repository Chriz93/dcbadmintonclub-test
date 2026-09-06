-- Additive schema. Does not modify legacy public tables or their policies.
begin;
create schema if not exists club_app;
revoke all on schema club_app from public;
grant usage on schema club_app to authenticated, service_role;
create table club_app.clubs(id uuid primary key default gen_random_uuid(),slug text unique not null,name text not null,settings jsonb not null default '{}');
create table club_app.platform_owners(user_id uuid primary key references auth.users(id));
create table club_app.members(id uuid primary key references auth.users(id), display_name text not null check(length(display_name) between 1 and 100), email text not null, phone text, emergency text, medical text);
create table club_app.memberships(club_id uuid not null references club_app.clubs(id),user_id uuid not null references club_app.members(id),role text not null check(role in ('club_owner','club_admin','scorekeeper','member')),status text not null default 'pending' check(status in ('pending','active','waitlisted','inactive')),kind text not null default 'regular' check(kind in ('regular','spare')),paid boolean not null default false,primary key(club_id,user_id));
create table club_app.venues(id uuid primary key default gen_random_uuid(),club_id uuid not null references club_app.clubs(id),name text not null,address text not null,rooms text not null,unique(club_id,id));
create table club_app.courts(id uuid primary key default gen_random_uuid(),club_id uuid not null,venue_id uuid not null,number int not null check(number>0),unique(club_id,id),unique(venue_id,number),foreign key(club_id,venue_id) references club_app.venues(club_id,id));
create table club_app.seasons(id uuid primary key default gen_random_uuid(),club_id uuid not null references club_app.clubs(id),name text not null,timezone text not null default 'America/Toronto',regular_capacity int not null check(regular_capacity>0),spare_capacity int not null default 0 check(spare_capacity>=0),waitlist_capacity int not null default 0 check(waitlist_capacity>=0),rules jsonb not null default '{"normalTarget":21,"fiveTarget":15}',unique(club_id,id));
create table club_app.permit_imports(id uuid primary key default gen_random_uuid(),club_id uuid not null references club_app.clubs(id),permit_number text not null,source_name text not null,sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),preview jsonb not null,confirmed_by uuid references auth.users(id),confirmed_at timestamptz,unique(club_id,id));
create table club_app.sessions(id uuid primary key default gen_random_uuid(),club_id uuid not null,season_id uuid not null,venue_id uuid not null,permit_id uuid,starts_at timestamptz not null,ends_at timestamptz not null,status text not null default 'scheduled' check(status in ('scheduled','active','completed','cancelled')),capacity int not null check(capacity>0),rsvp_deadline timestamptz not null,revision int not null default 0,calendar_uid uuid not null default gen_random_uuid(),unique(club_id,id),unique(club_id,season_id,venue_id,starts_at),foreign key(club_id,season_id) references club_app.seasons(club_id,id),foreign key(club_id,venue_id) references club_app.venues(club_id,id),foreign key(club_id,permit_id) references club_app.permit_imports(club_id,id),check(ends_at>starts_at),check(rsvp_deadline<=starts_at));
create table club_app.waiver_versions(id uuid primary key default gen_random_uuid(),club_id uuid not null references club_app.clubs(id),version int not null,body text not null,sha256 text not null,published_at timestamptz not null default now(),unique(club_id,id),unique(club_id,version));
create table club_app.waiver_acceptances(club_id uuid not null,user_id uuid not null,waiver_id uuid not null,accepted_at timestamptz not null default now(),primary key(club_id,user_id,waiver_id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id),foreign key(club_id,waiver_id) references club_app.waiver_versions(club_id,id));
create table club_app.registrations(id uuid primary key default gen_random_uuid(),club_id uuid not null,season_id uuid not null,user_id uuid not null,status text not null default 'pending' check(status in ('pending','approved','waitlisted','rejected')),unique(club_id,season_id,user_id),foreign key(club_id,season_id) references club_app.seasons(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
create table club_app.rsvps(club_id uuid not null,session_id uuid not null,user_id uuid not null,response text not null check(response in ('attending','not_attending','maybe','late','need_spare')),note text not null default '' check(length(note)<=500),placement text not null check(placement in ('confirmed','waitlisted','none')),revision int not null,changed_by uuid not null references auth.users(id),changed_at timestamptz not null default now(),primary key(club_id,session_id,user_id),foreign key(club_id,session_id) references club_app.sessions(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
create table club_app.attendance(club_id uuid not null,session_id uuid not null,user_id uuid not null,status text not null check(status in ('present','absent','late','excused')),primary key(club_id,session_id,user_id),foreign key(club_id,session_id) references club_app.sessions(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
create table club_app.assignments(club_id uuid not null,session_id uuid not null,user_id uuid not null,court_id uuid not null,round int not null check(round>0),primary key(club_id,session_id,round,user_id),foreign key(club_id,session_id) references club_app.sessions(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id),foreign key(club_id,court_id) references club_app.courts(club_id,id));
create table club_app.matches(id uuid primary key default gen_random_uuid(),club_id uuid not null,session_id uuid not null,court_id uuid not null,round int not null check(round>0),game int not null check(game>0),target int not null check(target between 1 and 99),side_a uuid[] not null,side_b uuid[] not null,score_a int,score_b int,revision int not null default 0,unique(club_id,id),unique(club_id,session_id,court_id,round,game),foreign key(club_id,session_id) references club_app.sessions(club_id,id),foreign key(club_id,court_id) references club_app.courts(club_id,id));
create table club_app.rankings(club_id uuid not null,season_id uuid not null,user_id uuid not null,played int not null default 0,wins int not null default 0,points int not null default 0,possible_points int not null default 0,primary key(club_id,season_id,user_id),foreign key(club_id,season_id) references club_app.seasons(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
create table club_app.announcements(id uuid primary key default gen_random_uuid(),club_id uuid not null references club_app.clubs(id),title text not null,body text not null,public boolean not null default false);
create table club_app.notification_preferences(club_id uuid not null,user_id uuid not null,channel text not null check(channel in ('email','sms','whatsapp')),enabled boolean not null default false,consented_at timestamptz,primary key(club_id,user_id,channel),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id),check(not enabled or consented_at is not null));
create table club_app.notification_deliveries(id uuid primary key default gen_random_uuid(),club_id uuid not null,user_id uuid not null,idempotency_key text unique not null,template text not null,payload jsonb not null,status text not null default 'pending' check(status in ('pending','processing','delivered','failed','suppressed')),attempts int not null default 0,available_at timestamptz not null default now(),lease_until timestamptz,provider_message_id text,failure_reason text,created_at timestamptz not null default now(),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
create table club_app.audit_events(id bigint generated always as identity primary key,club_id uuid not null references club_app.clubs(id),actor uuid not null references auth.users(id),subject uuid,action text not null,before_value jsonb,after_value jsonb,created_at timestamptz not null default now());
create table club_app.requests(club_id uuid not null references club_app.clubs(id),actor uuid not null references auth.users(id),key uuid not null,payload jsonb not null,result jsonb not null,primary key(club_id,actor,key));
create table club_app.rate_limits(user_id uuid not null references auth.users(id),bucket timestamptz not null,hits int not null,primary key(user_id,bucket));
create index on club_app.sessions(club_id,starts_at);
create index on club_app.rsvps(club_id,session_id,placement,changed_at);
create index on club_app.notification_deliveries(status,available_at);
create index on club_app.audit_events(club_id,created_at);

create function club_app.is_member(c uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from club_app.memberships where club_id=c and user_id=auth.uid() and status='active') $$;
create function club_app.is_admin(c uuid) returns boolean language sql stable security definer set search_path='' as $$ select coalesce(auth.jwt()->>'aal','')='aal2' and (exists(select 1 from club_app.platform_owners where user_id=auth.uid()) or exists(select 1 from club_app.memberships where club_id=c and user_id=auth.uid() and status='active' and role in ('club_owner','club_admin'))) $$;
create function club_app.is_scorekeeper(c uuid) returns boolean language sql stable security definer set search_path='' as $$ select club_app.is_admin(c) or exists(select 1 from club_app.memberships where club_id=c and user_id=auth.uid() and status='active' and role='scorekeeper') $$;
-- All relations denied by default; only the explicit reads and RPCs below are granted.
do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='club_app' loop execute format('alter table club_app.%I enable row level security',t.tablename); end loop; end $$;
create policy own_profile on club_app.members for select to authenticated using(id=auth.uid());
create policy own_membership on club_app.memberships for select to authenticated using(user_id=auth.uid() or club_app.is_admin(club_id));
create policy own_rsvp on club_app.rsvps for select to authenticated using(user_id=auth.uid() or club_app.is_scorekeeper(club_id));
create policy own_preferences on club_app.notification_preferences for select to authenticated using(user_id=auth.uid());
create policy admin_audit on club_app.audit_events for select to authenticated using(club_app.is_admin(club_id));
create policy admin_delivery on club_app.notification_deliveries for select to authenticated using(club_app.is_admin(club_id));
create policy own_registration on club_app.registrations for select to authenticated using(user_id=auth.uid() or club_app.is_admin(club_id));
create policy own_waiver on club_app.waiver_acceptances for select to authenticated using(user_id=auth.uid());
create policy own_attendance on club_app.attendance for select to authenticated using(user_id=auth.uid() or club_app.is_scorekeeper(club_id));
create policy own_rankings on club_app.rankings for select to authenticated using(user_id=auth.uid() or club_app.is_admin(club_id));
do $$ declare t text; begin foreach t in array array['clubs','venues','courts','seasons','sessions','waiver_versions','announcements','matches','assignments'] loop
 if t='clubs' then execute 'create policy tenant_read on club_app.clubs for select to authenticated using (club_app.is_member(id) or club_app.is_admin(id))';
 else execute format('create policy tenant_read on club_app.%I for select to authenticated using (club_app.is_member(club_id) or club_app.is_admin(club_id))',t);end if;
 end loop;end $$;
grant select on club_app.members,club_app.memberships,club_app.rsvps,club_app.notification_preferences,club_app.audit_events,club_app.notification_deliveries,club_app.registrations,club_app.waiver_acceptances,club_app.attendance,club_app.rankings,club_app.clubs,club_app.venues,club_app.courts,club_app.seasons,club_app.sessions,club_app.waiver_versions,club_app.announcements,club_app.matches,club_app.assignments to authenticated;

create function club_app.throttle() returns void language plpgsql security definer set search_path='' as $$ declare n int;begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501';end if;
 insert into club_app.rate_limits values(auth.uid(),date_trunc('minute',now()),1) on conflict(user_id,bucket) do update set hits=club_app.rate_limits.hits+1 returning hits into n;
 if n>30 then raise exception 'Rate limit exceeded' using errcode='P0001';end if;
end $$;
create function club_app.enqueue(c uuid,u uuid,k text,t text,p jsonb) returns void language sql security definer set search_path='' as $$ insert into club_app.notification_deliveries(club_id,user_id,idempotency_key,template,payload) select c,u,k,t,p where exists(select 1 from club_app.notification_preferences where club_id=c and user_id=u and channel='email' and enabled) on conflict(idempotency_key) do nothing $$;
create function club_app.set_preference(c uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 perform club_app.throttle();if not club_app.is_member(c) then raise exception 'Forbidden' using errcode='42501';end if;
 insert into club_app.notification_preferences values(c,auth.uid(),'email',enabled,case when enabled then now() end) on conflict(club_id,user_id,channel) do update set enabled=excluded.enabled,consented_at=excluded.consented_at;
end $$;
create function club_app.submit_rsvp(c uuid,s uuid,u uuid,response text,note text,expected_revision int,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare sess club_app.sessions; old club_app.rsvps; saved club_app.rsvps; prior club_app.requests; payload jsonb; v_placement text; occupied int; promoted club_app.rsvps;
begin
 perform club_app.throttle();
 if (u<>auth.uid() and not club_app.is_admin(c)) or not exists(select 1 from club_app.memberships where club_id=c and user_id=u and status='active') or not(club_app.is_member(c) or club_app.is_admin(c)) then raise exception 'Forbidden' using errcode='42501';end if;
 if response not in ('attending','not_attending','maybe','late','need_spare') or length(note)>500 or note is null then raise exception 'Invalid RSVP';end if;
 select * into sess from club_app.sessions where club_id=c and id=s for update;
 if not found then raise exception 'Session unavailable';end if;
 payload=jsonb_build_object('session',s,'user',u,'response',response,'note',note,'revision',expected_revision);
 select * into prior from club_app.requests where club_id=c and actor=auth.uid() and key=request_id;
 if found then if prior.payload<>payload then raise exception 'Idempotency key reused with different payload';end if;return prior.result;end if;
 if sess.status not in ('scheduled','active') or (now()>sess.rsvp_deadline and not club_app.is_admin(c)) then raise exception 'RSVP closed';end if;
 select * into old from club_app.rsvps where club_id=c and session_id=s and user_id=u;
 if coalesce(old.revision,0)<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 select count(*) into occupied from club_app.rsvps where club_id=c and session_id=s and user_id<>u and club_app.rsvps.placement='confirmed';
 v_placement=case when response in ('attending','late') then case when occupied<sess.capacity then 'confirmed' else 'waitlisted' end else 'none' end;
 insert into club_app.rsvps values(c,s,u,response,note,v_placement,expected_revision+1,auth.uid(),now()) on conflict(club_id,session_id,user_id) do update set response=excluded.response,note=excluded.note,placement=excluded.placement,revision=excluded.revision,changed_by=excluded.changed_by,changed_at=excluded.changed_at returning * into saved;
 insert into club_app.audit_events(club_id,actor,subject,action,before_value,after_value) values(c,auth.uid(),u,'rsvp.changed',jsonb_build_object('response',old.response,'revision',old.revision),jsonb_build_object('response',saved.response,'revision',saved.revision));
 perform club_app.enqueue(c,u,'rsvp:'||s||':'||u||':'||saved.revision,'rsvp.changed',jsonb_build_object('session',s,'response',saved.response,'placement',saved.placement));
 if old.placement='confirmed' and saved.placement<>'confirmed' then
  select * into promoted from club_app.rsvps where club_id=c and session_id=s and club_app.rsvps.placement='waitlisted' order by changed_at,user_id limit 1 for update;
  if found then update club_app.rsvps set placement='confirmed',revision=revision+1,changed_by=auth.uid(),changed_at=now() where club_id=c and session_id=s and user_id=promoted.user_id;
   insert into club_app.audit_events(club_id,actor,subject,action,before_value,after_value) values(c,auth.uid(),promoted.user_id,'waitlist.promoted','{"placement":"waitlisted"}','{"placement":"confirmed"}');
   perform club_app.enqueue(c,promoted.user_id,'promoted:'||s||':'||promoted.user_id||':'||(promoted.revision+1),'waitlist.promoted',jsonb_build_object('session',s));
  end if;
 end if;
 insert into club_app.requests values(c,auth.uid(),request_id,payload,to_jsonb(saved));return to_jsonb(saved);
end $$;
create function club_app.submit_score(c uuid,m uuid,a int,b int,expected_revision int) returns int language plpgsql security definer set search_path='' as $$ declare game club_app.matches;begin
 perform club_app.throttle();if not club_app.is_scorekeeper(c) then raise exception 'Forbidden' using errcode='42501';end if;
 select * into game from club_app.matches where club_id=c and id=m for update;if not found then raise exception 'Match unavailable';end if;
 if game.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if not exists(select 1 from club_app.sessions where club_id=c and id=game.session_id and status='active') then raise exception 'Session is not active';end if;
 if a is null or b is null or a<0 or b<0 or greatest(a,b)<>game.target or a=b then raise exception 'Invalid completed score';end if;
 update club_app.matches set score_a=a,score_b=b,revision=revision+1 where id=m;
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'score.changed',jsonb_build_object('match',m,'a',game.score_a,'b',game.score_b),jsonb_build_object('match',m,'a',a,'b',b));
 return game.revision+1;
end $$;
-- No default EXECUTE for PUBLIC, including private security-definer helpers.
revoke all on all functions in schema club_app from public, anon, authenticated;
grant execute on function club_app.is_member(uuid),club_app.is_admin(uuid),club_app.is_scorekeeper(uuid),club_app.set_preference(uuid,boolean),club_app.submit_rsvp(uuid,uuid,uuid,text,text,int,uuid),club_app.submit_score(uuid,uuid,int,int,int) to authenticated;
grant all on all tables in schema club_app to service_role;
grant usage,select on all sequences in schema club_app to service_role;
alter default privileges in schema club_app revoke execute on functions from public;
commit;
