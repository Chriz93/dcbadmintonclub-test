-- Registration payment declaration, season dates in the database, and the 48-hour voting lock.
-- * players.declared_payment: what the player said at registration ('' | paid_full | will_pay | per_session); the
--   admin still confirms money in the ledger.
-- * season_dates: the 28 approved Tuesdays (8:00 PM Ottawa), so database rules can enforce the voting deadline.
-- * set_rsvp: regulars cannot change their answer once voting closes 48 hours before play; the admin can.
begin;
alter table public.players add column if not exists declared_payment text not null default '' check(declared_payment in ('','paid_full','will_pay','per_session'));
create table if not exists public.season_dates(session_number int primary key,play_on date not null,start_at timestamptz not null);
insert into public.season_dates(session_number,play_on,start_at) values
 (1,'2026-09-15','2026-09-15T20:00:00-04:00'),
 (2,'2026-09-22','2026-09-22T20:00:00-04:00'),
 (3,'2026-09-29','2026-09-29T20:00:00-04:00'),
 (4,'2026-10-06','2026-10-06T20:00:00-04:00'),
 (5,'2026-10-13','2026-10-13T20:00:00-04:00'),
 (6,'2026-10-20','2026-10-20T20:00:00-04:00'),
 (7,'2026-10-27','2026-10-27T20:00:00-04:00'),
 (8,'2026-11-03','2026-11-03T20:00:00-05:00'),
 (9,'2026-11-10','2026-11-10T20:00:00-05:00'),
 (10,'2026-11-17','2026-11-17T20:00:00-05:00'),
 (11,'2026-11-24','2026-11-24T20:00:00-05:00'),
 (12,'2026-12-15','2026-12-15T20:00:00-05:00'),
 (13,'2027-01-05','2027-01-05T20:00:00-05:00'),
 (14,'2027-01-19','2027-01-19T20:00:00-05:00'),
 (15,'2027-01-26','2027-01-26T20:00:00-05:00'),
 (16,'2027-02-02','2027-02-02T20:00:00-05:00'),
 (17,'2027-02-09','2027-02-09T20:00:00-05:00'),
 (18,'2027-02-16','2027-02-16T20:00:00-05:00'),
 (19,'2027-02-23','2027-02-23T20:00:00-05:00'),
 (20,'2027-03-02','2027-03-02T20:00:00-05:00'),
 (21,'2027-03-09','2027-03-09T20:00:00-05:00'),
 (22,'2027-03-23','2027-03-23T20:00:00-04:00'),
 (23,'2027-03-30','2027-03-30T20:00:00-04:00'),
 (24,'2027-04-13','2027-04-13T20:00:00-04:00'),
 (25,'2027-04-20','2027-04-20T20:00:00-04:00'),
 (26,'2027-05-04','2027-05-04T20:00:00-04:00'),
 (27,'2027-05-11','2027-05-11T20:00:00-04:00'),
 (28,'2027-05-18','2027-05-18T20:00:00-04:00')
on conflict(session_number) do update set play_on=excluded.play_on,start_at=excluded.start_at;
alter table public.season_dates enable row level security;
revoke all on public.season_dates from public,anon;
drop policy if exists "members read season dates" on public.season_dates;
create policy "members read season dates" on public.season_dates for select to authenticated using(true);
grant select on public.season_dates to authenticated;

drop function if exists public.register_me(text,text,text,text,text,text);
create or replace function public.register_me(p_name text,p_phone text,p_emergency text,p_medical text,p_sig text,p_membership text,p_payment text default '') returns bigint language plpgsql security definer set search_path='' as $$ declare em text; inv public.invitations; existing public.players; pid bigint; pay text; begin
 select lower(trim(email)) into em from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if em is null then raise exception 'Verified sign-in email required' using errcode='42501';end if;
 select * into inv from public.invitations where email=em;
 select * into existing from public.players where user_id=auth.uid() or (user_id is null and lower(email)=em) order by user_id is not null desc limit 1;
 if existing.id is null and inv.email is null and not public.is_admin_any_factor() then raise exception 'Registration is closed. This link is for players Christy has confirmed; contact the organizer if you were accepted.' using errcode='42501';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 80 or coalesce(length(p_phone),0)>40 or coalesce(length(p_emergency),0)>200 or coalesce(length(p_medical),0)>500 or coalesce(length(p_sig),0)>200000 then raise exception 'Invalid registration details';end if;
 pay=case when p_payment in ('paid_full','will_pay','per_session') then p_payment else '' end;
 if existing.id is null then
  insert into public.players(name,email,phone,emergency,medical,sig,waiver_signed,paid,current_court,highest_court,season_wins,season_losses,games_played,membership_type,approved,waitlisted,registered_at,user_id,declared_payment)
  values(trim(p_name),em,coalesce(p_phone,''),coalesce(p_emergency,''),coalesce(p_medical,''),coalesce(p_sig,''),p_sig is not null and p_sig<>'',false,0,0,0,0,0,coalesce(inv.membership_type,p_membership,'regular'),false,false,now(),auth.uid(),pay) returning id into pid;
 else
  update public.players set name=trim(p_name),phone=coalesce(p_phone,phone),emergency=coalesce(p_emergency,emergency),medical=coalesce(p_medical,medical),sig=case when p_sig is not null and p_sig<>'' then p_sig else sig end,waiver_signed=(p_sig is not null and p_sig<>'') or waiver_signed,membership_type=coalesce(inv.membership_type,membership_type),registered_at=now(),user_id=auth.uid(),declared_payment=case when pay<>'' then pay else declared_payment end,updated_at=now() where id=existing.id returning id into pid;
 end if;
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'player.registered',pid::text,jsonb_build_object('payment',pay));
 return pid;
end $$;
revoke all on function public.register_me(text,text,text,text,text,text,text) from public,anon;
grant execute on function public.register_me(text,text,text,text,text,text,text) to authenticated;

create or replace function public.set_rsvp(p_session int,p_player bigint,p_response text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$ begin
 if p_player<>public.my_player_id() and not public.is_admin() then raise exception 'You can only answer for yourself' using errcode='42501';end if;
 if p_response not in ('coming','notcoming','maybe','late','need_spare') then raise exception 'Invalid response';end if;
 if not public.is_admin()
    and exists(select 1 from public.players p where p.id=p_player and coalesce(p.membership_type,'regular')<>'spare')
    and exists(select 1 from public.season_dates d where d.session_number=p_session and now()>d.start_at-interval '48 hours')
 then raise exception 'Voting closed 48 hours before play. Message the admin in the group to change your answer.' using errcode='42501';end if;
 insert into public.rsvps(session_number,player_id,response,note) values(p_session,p_player,p_response,coalesce(p_note,''))
 on conflict(session_number,player_id) do update set response=excluded.response,note=excluded.note,updated_at=now();
end $$;
commit;
