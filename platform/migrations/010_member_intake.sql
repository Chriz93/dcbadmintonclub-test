begin;
create table club_app.member_intake(
 club_id uuid not null,season_id uuid not null,user_id uuid not null,
 legal_name text not null check(length(trim(legal_name)) between 1 and 150),
 kind text not null check(kind in ('regular','spare')),
 emergency_contact text not null check(length(trim(emergency_contact)) between 1 and 200),
 payment_reference text not null default '' check(length(payment_reference)<=200),
 claimed_amount_cents int not null default 0 check(claimed_amount_cents between 0 and 100000),
 payment_status text not null default 'unverified' check(payment_status in ('unverified','verified')),
 verified_by uuid references auth.users(id),verified_at timestamptz,
 revision int not null default 0,updated_at timestamptz not null default now(),
 primary key(club_id,season_id,user_id),
 foreign key(club_id,season_id) references club_app.seasons(club_id,id),
 foreign key(club_id,user_id) references club_app.memberships(club_id,user_id)
);
alter table club_app.member_intake enable row level security;
create policy intake_private on club_app.member_intake for select to authenticated using(user_id=auth.uid() or club_app.is_admin(club_id));
revoke all on club_app.member_intake from public,anon,authenticated;
grant select on club_app.member_intake to authenticated;
create function club_app.submit_intake(c uuid,s uuid,legal_name text,display_name text,phone text,emergency_contact text,kind text,payment_reference text,claimed_amount_cents int,expected_revision int) returns int language plpgsql security definer set search_path='' as $$
declare email_address text; existing club_app.member_intake; next_revision int;begin
 perform club_app.throttle();
 select email into email_address from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if email_address is null then raise exception 'Verified email required' using errcode='42501';end if;
 if expected_revision is null or expected_revision<0 or phone is null or length(trim(phone)) not between 5 and 40 then raise exception 'Phone and revision required';end if;
 perform 1 from club_app.seasons where club_id=c and id=s for update;if not found then raise exception 'Season unavailable';end if;
 select * into existing from club_app.member_intake i where i.club_id=c and i.season_id=s and i.user_id=auth.uid() for update;
 if coalesce(existing.revision,0)<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if existing.payment_status='verified' then raise exception 'Ask administrator to correct verified registration';end if;
 insert into club_app.members(id,display_name,email,phone) values(auth.uid(),trim(display_name),email_address,trim(phone)) on conflict(id) do update set display_name=excluded.display_name,phone=excluded.phone;
 insert into club_app.memberships(club_id,user_id,role,status,kind) values(c,auth.uid(),'member','pending',kind) on conflict do nothing;
 insert into club_app.registrations(club_id,season_id,user_id) values(c,s,auth.uid()) on conflict do nothing;
 next_revision=coalesce(existing.revision,0)+1;
 insert into club_app.member_intake(club_id,season_id,user_id,legal_name,kind,emergency_contact,payment_reference,claimed_amount_cents,revision) values(c,s,auth.uid(),trim(legal_name),kind,trim(emergency_contact),trim(payment_reference),claimed_amount_cents,next_revision)
 on conflict(club_id,season_id,user_id) do update set legal_name=excluded.legal_name,kind=excluded.kind,emergency_contact=excluded.emergency_contact,payment_reference=excluded.payment_reference,claimed_amount_cents=excluded.claimed_amount_cents,revision=excluded.revision,updated_at=now();
 insert into club_app.audit_events(club_id,actor,subject,action,after_value) values(c,auth.uid(),auth.uid(),'intake.submitted',jsonb_build_object('season',s,'revision',next_revision));
 return next_revision;
end $$;
create function club_app.verify_intake_payment(c uuid,s uuid,u uuid,expected_revision int,reason text) returns void language plpgsql security definer set search_path='' as $$ declare intake club_app.member_intake;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if expected_revision is null or reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Revision and verification reason required';end if;
 select * into intake from club_app.member_intake where club_id=c and season_id=s and user_id=u for update;
 if not found then raise exception 'Intake unavailable';end if;
 if intake.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if intake.claimed_amount_cents<=0 then raise exception 'Positive payment required';end if;
 update club_app.member_intake set payment_status='verified',verified_by=auth.uid(),verified_at=now(),revision=revision+1 where club_id=c and season_id=s and user_id=u;
 insert into club_app.audit_events(club_id,actor,subject,action,after_value) values(c,auth.uid(),u,'payment.verified',jsonb_build_object('season',s,'amount_cents',intake.claimed_amount_cents,'reason',trim(reason)));
end $$;
-- Public intake metadata deliberately does not publish the private roster or waiver draft.
create function club_app.intake_options(club_slug text) returns table(club_id uuid,season_id uuid,season_name text) language sql stable security definer set search_path='' as $$ select c.id,s.id,s.name from club_app.clubs c join club_app.seasons s on s.club_id=c.id where c.slug=club_slug $$;
revoke all on function club_app.submit_intake(uuid,uuid,text,text,text,text,text,text,int,int),club_app.verify_intake_payment(uuid,uuid,uuid,int,text),club_app.intake_options(text) from public,anon,authenticated;
grant execute on function club_app.submit_intake(uuid,uuid,text,text,text,text,text,text,int,int),club_app.verify_intake_payment(uuid,uuid,uuid,int,text) to authenticated;
grant execute on function club_app.intake_options(text) to anon,authenticated;
commit;
