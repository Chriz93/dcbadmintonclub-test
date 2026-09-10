-- Organizers may register themselves as players without an invitation (they are already trusted accounts).
-- Everyone else still needs an existing player record or an invitation row added by the organizer.
begin;
create or replace function public.register_me(p_name text,p_phone text,p_emergency text,p_medical text,p_sig text,p_membership text) returns bigint language plpgsql security definer set search_path='' as $$ declare em text; inv public.invitations; existing public.players; pid bigint; begin
 select lower(trim(email)) into em from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if em is null then raise exception 'Verified sign-in email required' using errcode='42501';end if;
 select * into inv from public.invitations where email=em;
 select * into existing from public.players where user_id=auth.uid() or (user_id is null and lower(email)=em) order by user_id is not null desc limit 1;
 if existing.id is null and inv.email is null and not public.is_admin_any_factor() then raise exception 'Registration is closed. This link is for players Christy has confirmed; contact the organizer if you were accepted.' using errcode='42501';end if;
 if p_name is null or length(trim(p_name)) not between 2 and 80 or coalesce(length(p_phone),0)>40 or coalesce(length(p_emergency),0)>200 or coalesce(length(p_medical),0)>500 or coalesce(length(p_sig),0)>200000 then raise exception 'Invalid registration details';end if;
 if existing.id is null then
  insert into public.players(name,email,phone,emergency,medical,sig,waiver_signed,paid,current_court,highest_court,season_wins,season_losses,games_played,membership_type,approved,waitlisted,registered_at,user_id)
  values(trim(p_name),em,coalesce(p_phone,''),coalesce(p_emergency,''),coalesce(p_medical,''),coalesce(p_sig,''),p_sig is not null and p_sig<>'',false,0,0,0,0,0,coalesce(inv.membership_type,p_membership,'regular'),false,false,now(),auth.uid()) returning id into pid;
 else
  update public.players set name=trim(p_name),phone=coalesce(p_phone,phone),emergency=coalesce(p_emergency,emergency),medical=coalesce(p_medical,medical),sig=case when p_sig is not null and p_sig<>'' then p_sig else sig end,waiver_signed=(p_sig is not null and p_sig<>'') or waiver_signed,membership_type=coalesce(inv.membership_type,membership_type),registered_at=now(),user_id=auth.uid(),updated_at=now() where id=existing.id returning id into pid;
 end if;
 insert into public.audit_log(actor,action,subject) values(auth.uid(),'player.registered',pid::text);
 return pid;
end $$;
commit;
