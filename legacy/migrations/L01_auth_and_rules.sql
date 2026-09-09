-- Maplewood league site, Phase 1: sign-in, organizer role and row-level rules for the legacy tables.
-- Additive and idempotent. Safe for TEST now and for production at cutover (after a verified backup).
begin;

-- Columns the running app already reads/writes but the original setup never created.
alter table public.players add column if not exists approved boolean not null default true;
alter table public.players add column if not exists waitlisted boolean not null default false;
alter table public.players add column if not exists registered_at timestamptz;
alter table public.players add column if not exists admin_note text not null default '';
alter table public.players add column if not exists user_id uuid references auth.users(id);
alter table public.players add column if not exists updated_at timestamptz not null default now();
create index if not exists players_email_lower on public.players(lower(email));
alter table public.app_state add column if not exists version int not null default 0;
alter table public.app_state add column if not exists updated_at timestamptz not null default now();
create unique index if not exists app_state_key_unique on public.app_state(key);

-- Organizer accounts. A row here plus a second factor (aal2 in the token) is what "admin" means.
create table if not exists public.app_admins(user_id uuid primary key references auth.users(id) on delete cascade,label text not null default 'organizer',added_at timestamptz not null default now());

-- Closed registration: only these sign-in emails may complete onboarding.
create table if not exists public.invitations(email text primary key check(email=lower(trim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),membership_type text not null default 'regular' check(membership_type in ('regular','spare')),note text not null default '',created_at timestamptz not null default now());

-- Per-player records that used to be shared JSON blobs (lost updates, forgeable).
create table if not exists public.rsvps(session_number int not null,player_id bigint not null references public.players(id) on delete cascade,response text not null check(response in ('coming','notcoming','maybe','late','need_spare')),note text not null default '' check(length(note)<=300),updated_at timestamptz not null default now(),primary key(session_number,player_id));
create table if not exists public.questions(id bigint generated always as identity primary key,player_id bigint references public.players(id) on delete set null,asker text not null default '',question text not null check(length(question) between 1 and 1000),answer text,answered_at timestamptz,created_at timestamptz not null default now());
create table if not exists public.audit_log(id bigint generated always as identity primary key,actor uuid,action text not null,subject text,detail jsonb,created_at timestamptz not null default now());

create or replace function public.my_email() returns text language sql stable as $$ select lower(trim(coalesce(auth.jwt()->>'email',''))) $$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(auth.jwt()->>'aal','')='aal2' and exists(select 1 from public.app_admins a where a.user_id=auth.uid())
$$;
create or replace function public.is_admin_any_factor() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.app_admins a where a.user_id=auth.uid())
$$;
create or replace function public.my_player_id() returns bigint language sql stable security definer set search_path='' as $$
 select p.id from public.players p where p.user_id=auth.uid() or (p.user_id is null and lower(p.email)=public.my_email()) order by p.user_id is not null desc,p.id limit 1
$$;

-- Replace every unconditional anonymous policy.
do $$ declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('players','announcements','app_state','rsvps','questions','invitations','app_admins','audit_log') loop
  execute format('drop policy if exists %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;
alter table public.players enable row level security;
alter table public.announcements enable row level security;
alter table public.app_state enable row level security;
alter table public.rsvps enable row level security;
alter table public.questions enable row level security;
alter table public.invitations enable row level security;
alter table public.app_admins enable row level security;
alter table public.audit_log enable row level security;

create policy players_read on public.players for select to authenticated using(public.is_admin() or user_id=auth.uid() or (user_id is null and lower(email)=public.my_email()));
create policy players_admin_insert on public.players for insert to authenticated with check(public.is_admin());
create policy players_admin_update on public.players for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy players_admin_delete on public.players for delete to authenticated using(public.is_admin());
create policy announcements_read on public.announcements for select to authenticated using(true);
create policy announcements_admin_write on public.announcements for insert to authenticated with check(public.is_admin());
create policy announcements_admin_update on public.announcements for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy announcements_admin_delete on public.announcements for delete to authenticated using(public.is_admin());
-- Shared state is readable by signed-in members except private snapshots and retired secrets; only organizers write, and only through set_state().
create policy app_state_read on public.app_state for select to authenticated using(public.is_admin() or (key not like 'snapshot\_%' and key not in ('admin_pin','pin','invite_code')));
create policy rsvps_read on public.rsvps for select to authenticated using(true);
create policy rsvps_own_insert on public.rsvps for insert to authenticated with check(player_id=public.my_player_id());
create policy rsvps_own_update on public.rsvps for update to authenticated using(player_id=public.my_player_id() or public.is_admin()) with check(player_id=public.my_player_id() or public.is_admin());
create policy questions_read on public.questions for select to authenticated using(true);
create policy questions_own_insert on public.questions for insert to authenticated with check(player_id=public.my_player_id());
create policy questions_admin_update on public.questions for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy questions_admin_delete on public.questions for delete to authenticated using(public.is_admin());
create policy invitations_admin on public.invitations for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy app_admins_self on public.app_admins for select to authenticated using(user_id=auth.uid() or public.is_admin());
create policy audit_admin_read on public.audit_log for select to authenticated using(public.is_admin());

-- Public projection for standings, courts and rosters: no contact, emergency, medical or signature data.
create or replace view public.players_public as
 select id,name,paid,current_court,highest_court,season_wins,season_losses,games_played,no_show_count,membership_type,approved,waitlisted,registered_at,created_at,
 (waiver_signed is true or (sig is not null and sig<>'' and sig<>'admin')) as waiver_ok,(user_id is not null) as has_account
 from public.players;

-- Versioned shared-state writes: a stale screen cannot overwrite newer data.
create or replace function public.set_state(k text,v text,expected int) returns int language plpgsql security definer set search_path='' as $$ declare cur int;begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 if k is null or length(k) not between 1 and 120 or v is null or k like 'snapshot\_%' and length(v)>4000000 then raise exception 'Invalid state write';end if;
 if k in ('admin_pin','pin','invite_code') then raise exception 'Retired key';end if;
 select version into cur from public.app_state where key=k for update;
 if cur is null then
  if coalesce(expected,0)<>0 then raise exception 'Stale state: refresh before saving' using errcode='40001';end if;
  insert into public.app_state(key,value,version,updated_at) values(k,v,1,now());return 1;
 end if;
 if expected is null or expected<>cur then raise exception 'Stale state: refresh before saving' using errcode='40001';end if;
 update public.app_state set value=v,version=cur+1,updated_at=now() where key=k;
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'state.set',k,jsonb_build_object('version',cur+1));
 return cur+1;
end $$;
create or replace function public.delete_state(k text) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 delete from public.app_state where key=k;
 insert into public.audit_log(actor,action,subject) values(auth.uid(),'state.delete',k);
end $$;

-- Registration through the closed list: creates or claims the caller's own player row only.
create or replace function public.register_me(p_name text,p_phone text,p_emergency text,p_medical text,p_sig text,p_membership text) returns bigint language plpgsql security definer set search_path='' as $$ declare em text; inv public.invitations; existing public.players; pid bigint;begin
 select lower(trim(email)) into em from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if em is null then raise exception 'Verified sign-in email required' using errcode='42501';end if;
 select * into inv from public.invitations where email=em;
 select * into existing from public.players where user_id=auth.uid() or (user_id is null and lower(email)=em) order by user_id is not null desc limit 1;
 if existing.id is null and inv.email is null then raise exception 'Registration is closed. This link is for players Christy has confirmed; contact the organizer if you were accepted.' using errcode='42501';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 80 or coalesce(length(p_phone),0)>40 or coalesce(length(p_emergency),0)>200 or coalesce(length(p_medical),0)>500 or coalesce(length(p_sig),0)>200000 then raise exception 'Invalid registration details';end if;
 if existing.id is null then
  insert into public.players(name,email,phone,emergency,medical,sig,waiver_signed,paid,current_court,highest_court,season_wins,season_losses,games_played,membership_type,approved,waitlisted,registered_at,user_id)
  values(trim(p_name),em,coalesce(p_phone,''),coalesce(p_emergency,''),coalesce(p_medical,''),coalesce(p_sig,''),p_sig is not null and p_sig<>'',false,0,0,0,0,0,coalesce(inv.membership_type,p_membership,'regular'),false,false,now(),auth.uid()) returning id into pid;
 else
  update public.players set name=trim(p_name),phone=coalesce(p_phone,phone),emergency=coalesce(p_emergency,emergency),medical=coalesce(p_medical,medical),sig=case when p_sig is not null and p_sig<>'' then p_sig else sig end,waiver_signed=waiver_signed or (p_sig is not null and p_sig<>''),registered_at=coalesce(registered_at,now()),user_id=auth.uid(),updated_at=now() where id=existing.id returning id into pid;
 end if;
 insert into public.audit_log(actor,action,subject) values(auth.uid(),'player.registered',pid::text);
 return pid;
end $$;
create or replace function public.update_my_profile(p_phone text,p_emergency text,p_medical text) returns void language plpgsql security definer set search_path='' as $$ declare pid bigint;begin
 pid=public.my_player_id();if pid is null then raise exception 'No player record' using errcode='42501';end if;
 if coalesce(length(p_phone),0)>40 or coalesce(length(p_emergency),0)>200 or coalesce(length(p_medical),0)>500 then raise exception 'Invalid details';end if;
 update public.players set phone=coalesce(p_phone,phone),emergency=coalesce(p_emergency,emergency),medical=coalesce(p_medical,medical),user_id=coalesce(user_id,auth.uid()),updated_at=now() where id=pid;
end $$;
-- Own RSVP for the current session (upsert; admins may record on a player's behalf).
create or replace function public.set_rsvp(p_session int,p_player bigint,p_response text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$ begin
 if p_player<>public.my_player_id() and not public.is_admin() then raise exception 'You can only answer for yourself' using errcode='42501';end if;
 if p_response not in ('coming','notcoming','maybe','late','need_spare') then raise exception 'Invalid response';end if;
 insert into public.rsvps(session_number,player_id,response,note) values(p_session,p_player,p_response,coalesce(p_note,''))
 on conflict(session_number,player_id) do update set response=excluded.response,note=excluded.note,updated_at=now();
end $$;
create or replace function public.admin_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('organizer',public.is_admin_any_factor(),'verified',public.is_admin(),'player_id',public.my_player_id(),'email',public.my_email())
$$;

-- Grants: nothing for anonymous visitors; members get rule-limited access; organizers act through the same rules.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon,public;
grant usage on schema public to authenticated;
grant select on public.players,public.announcements,public.app_state,public.rsvps,public.questions,public.invitations,public.app_admins,public.audit_log,public.players_public to authenticated;
grant insert,update,delete on public.players,public.announcements,public.questions,public.invitations to authenticated;
grant insert,update on public.rsvps to authenticated;
grant execute on function public.my_email(),public.is_admin(),public.is_admin_any_factor(),public.my_player_id(),public.set_state(text,text,int),public.delete_state(text),public.register_me(text,text,text,text,text,text),public.update_my_profile(text,text,text),public.set_rsvp(int,bigint,text,text),public.admin_status() to authenticated;
grant usage,select on all sequences in schema public to authenticated;
commit;
