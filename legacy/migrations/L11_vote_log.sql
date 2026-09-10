-- Every vote change is logged (who, what, when, by whom), so the admin sees changes and the reminder job can
-- send a digest. Voting closes Sunday 10:00 PM (46 hours before the 8:00 PM start).
begin;
create table if not exists public.rsvp_log(id bigint generated always as identity primary key,session_number int not null,player_id bigint not null references public.players(id) on delete cascade,old_response text,new_response text not null,changed_by uuid,by_admin boolean not null default false,changed_at timestamptz not null default now());
alter table public.rsvp_log enable row level security;
revoke all on public.rsvp_log from public,anon,authenticated;
create policy "admin reads vote log" on public.rsvp_log for select to authenticated using(public.is_admin());
grant select on public.rsvp_log to authenticated;
grant select on public.rsvp_log to service_role;
create or replace function public.log_rsvp_change() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' and old.response=new.response then return new; end if;
 insert into public.rsvp_log(session_number,player_id,old_response,new_response,changed_by,by_admin)
 values(new.session_number,new.player_id,case when tg_op='UPDATE' then old.response end,new.response,auth.uid(),coalesce(auth.jwt()->>'aal','')='aal2' and exists(select 1 from public.app_admins a where a.user_id=auth.uid()));
 return new;
end $$;
drop trigger if exists rsvp_log_trigger on public.rsvps;
create trigger rsvp_log_trigger after insert or update on public.rsvps for each row execute function public.log_rsvp_change();
-- Deadline moves to 46 hours (Sunday 10:00 PM).
create or replace function public.set_rsvp(p_session int,p_player bigint,p_response text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$ begin
 if p_player<>public.my_player_id() and not public.is_admin() then raise exception 'You can only answer for yourself' using errcode='42501';end if;
 if p_response not in ('coming','notcoming','maybe','late','need_spare') then raise exception 'Invalid response';end if;
 if not public.is_admin()
    and exists(select 1 from public.players p where p.id=p_player and coalesce(p.membership_type,'regular')<>'spare')
    and exists(select 1 from public.season_dates d where d.session_number=p_session and now()>d.start_at-interval '46 hours')
 then raise exception 'Voting closed Sunday 10:00 PM. Message the admin in the group to change your answer.' using errcode='42501';end if;
 insert into public.rsvps(session_number,player_id,response,note) values(p_session,p_player,p_response,coalesce(p_note,''))
 on conflict(session_number,player_id) do update set response=excluded.response,note=excluded.note,updated_at=now();
end $$;
commit;
