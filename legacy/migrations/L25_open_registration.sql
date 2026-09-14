-- L25: open registration (organizer decision, 14 September 2026). Anyone with the site link who signs in with a verified
-- email code can register; they are saved as PENDING (approved=false, as before) and only the organizer approves them,
-- regulars up to capacity. This is the policy docs/17 describes ("the shared link allows pending intake … not an
-- invite-only allowlist"). The only change from L24 is removing the invitation check; an invitation still sets the
-- membership type. Safe on TEST and production; it changes no data. The schema version stays L24.
begin;
do $$ begin if not exists(select 1 from public.environment where schema_version='L24') then raise exception 'Refusing: run after L24'; end if; end $$;
create or replace function public.register_me(p_name text,p_phone text,p_emergency text,p_medical text,p_sig text,p_membership text,p_payment text default '',
  p_waiver_version text default '',p_waiver_sha text default '',p_waiver_sig text default '',p_tz text default '',p_offset int default null,p_age text default 'adult',p_minor text default '',p_media boolean default null,p_ua text default '')
returns bigint language plpgsql security definer set search_path='' as $$ declare em text; inv public.invitations; existing public.players; pid bigint; pay text; begin
 select lower(trim(email)) into em from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if em is null then raise exception 'Verified sign-in email required' using errcode='42501';end if;
 select * into inv from public.invitations where email=em;
 select * into existing from public.players where user_id=auth.uid() or (user_id is null and lower(email)=em) order by user_id is not null desc limit 1;
 if p_name is null or length(trim(p_name)) not between 2 and 80 or coalesce(length(p_phone),0)>40 or coalesce(length(p_emergency),0)>200 or coalesce(length(p_medical),0)>500 or coalesce(length(p_sig),0)>200000 then raise exception 'Invalid registration details';end if;
 pay=case when p_payment in ('paid_full','will_pay','per_session') then p_payment else '' end;
 if existing.id is null then
  insert into public.players(name,email,phone,emergency,medical,sig,waiver_signed,paid,current_court,highest_court,season_wins,season_losses,games_played,membership_type,approved,waitlisted,registered_at,user_id,declared_payment)
  values(trim(p_name),em,coalesce(p_phone,''),coalesce(p_emergency,''),coalesce(p_medical,''),coalesce(p_sig,''),p_sig is not null and p_sig<>'',false,0,0,0,0,0,coalesce(inv.membership_type,p_membership,'regular'),false,false,now(),auth.uid(),pay) returning id into pid;
 else
  update public.players set archived_at=null,approved=case when archived_at is not null then false else approved end,waitlisted=case when archived_at is not null then false else waitlisted end,name=trim(p_name),phone=coalesce(p_phone,phone),emergency=coalesce(p_emergency,emergency),medical=coalesce(p_medical,medical),sig=case when p_sig is not null and p_sig<>'' then p_sig else sig end,waiver_signed=(p_sig is not null and p_sig<>'') or waiver_signed,membership_type=coalesce(inv.membership_type,membership_type),registered_at=now(),user_id=auth.uid(),declared_payment=case when pay<>'' then pay else declared_payment end,updated_at=now() where id=existing.id returning id into pid;
 end if;
 perform public.record_waiver_acceptance(pid,em,p_name,p_waiver_version,p_waiver_sha,p_waiver_sig,p_tz,p_offset,'registration',p_age,p_minor,p_media,p_ua);
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'player.registered',pid::text,jsonb_build_object('payment',pay,'waiver',p_waiver_version));
 return pid;
end $$;
revoke all on function public.register_me(text,text,text,text,text,text,text,text,text,text,text,int,text,text,boolean,text) from public,anon;
grant execute on function public.register_me(text,text,text,text,text,text,text,text,text,text,text,int,text,text,boolean,text) to authenticated;
select 'register_me has no invitation check' check_name, case when position('Registration is closed' in pg_get_functiondef('public.register_me(text,text,text,text,text,text,text,text,text,text,text,int,text,text,boolean,text)'::regprocedure))=0 then 'OK' else 'FAIL' end result
union all select 'new sign-ups still pending', case when position('auth.uid(),pay) returning id' in pg_get_functiondef('public.register_me(text,text,text,text,text,text,text,text,text,text,text,int,text,text,boolean,text)'::regprocedure))>0 then 'OK' else 'FAIL' end;
commit;
