begin;
create table club_app.eligibility_reviews(
 club_id uuid not null,season_id uuid not null,user_id uuid not null,eligibility_revision int not null,
 reviewed_by uuid not null references auth.users(id),guardian_name text,reason text not null,reviewed_at timestamptz not null default now(),
 primary key(club_id,season_id,user_id),foreign key(club_id,season_id,user_id) references club_app.participant_eligibility(club_id,season_id,user_id)
);
alter table club_app.eligibility_reviews enable row level security;
create policy eligibility_review_admin on club_app.eligibility_reviews for select to authenticated using(club_app.is_admin(club_id));
revoke all on club_app.eligibility_reviews from public,anon,authenticated,service_role;
grant select on club_app.eligibility_reviews to authenticated;
create function club_app.review_eligibility(c uuid,s uuid,u uuid,expected_revision int,guardian_name text,reason text,confirmed boolean) returns void language plpgsql security definer set search_path='' as $$ declare e club_app.participant_eligibility;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if confirmed is not true or reason is null or length(trim(reason)) not between 10 and 500 then raise exception 'Record the independent identity and birth-date review';end if;
 perform 1 from club_app.seasons where club_id=c and id=s for update;
 select * into e from club_app.participant_eligibility where club_id=c and season_id=s and user_id=u for update;
 if not found or expected_revision is distinct from e.revision then raise exception 'Eligibility revision conflict' using errcode='40001';end if;
 if e.birth_date>current_date-interval '18 years' and (guardian_name is null or length(trim(guardian_name)) not between 2 and 150) then raise exception 'Independently confirmed guardian name required';end if;
 insert into club_app.eligibility_reviews values(c,s,u,e.revision,auth.uid(),case when e.birth_date>current_date-interval '18 years' then trim(guardian_name) end,trim(reason),now())
 on conflict(club_id,season_id,user_id) do update set eligibility_revision=excluded.eligibility_revision,reviewed_by=excluded.reviewed_by,guardian_name=excluded.guardian_name,reason=excluded.reason,reviewed_at=excluded.reviewed_at;
 insert into club_app.audit_events(club_id,actor,subject,action,after_value) values(c,auth.uid(),u,'eligibility.reviewed',jsonb_build_object('season',s,'eligibility_revision',e.revision,'reason',trim(reason)));
end $$;
alter function club_app.signing_options() rename to signing_options_email_impl;
revoke all on function club_app.signing_options_email_impl() from public,anon,authenticated,service_role;
create function club_app.signing_options() returns table(club_id uuid,season_id uuid,participant_id uuid,participant_name text,waiver_id uuid,version int,body text,sha256 text,capacity text) language sql stable security definer set search_path='' as $$
 select o.* from club_app.signing_options_email_impl() o
 where o.capacity='adult' or exists(select 1 from club_app.participant_eligibility e join club_app.eligibility_reviews r on r.club_id=e.club_id and r.season_id=e.season_id and r.user_id=e.user_id and r.eligibility_revision=e.revision where e.club_id=o.club_id and e.season_id=o.season_id and e.user_id=o.participant_id and r.guardian_name is not null)
$$;
alter function club_app.sign_agreement(uuid,uuid,uuid,uuid,text,text,text,boolean,boolean) rename to sign_agreement_identity_impl;
revoke all on function club_app.sign_agreement_identity_impl(uuid,uuid,uuid,uuid,text,text,text,boolean,boolean) from public,anon,authenticated,service_role;
create function club_app.sign_agreement(c uuid,s uuid,participant uuid,waiver uuid,expected_hash text,signer_name text,relationship text,adult_signer boolean,accepted boolean) returns uuid language plpgsql security definer set search_path='' as $$ begin
 perform 1 from club_app.seasons where club_id=c and id=s for update;
 if participant<>auth.uid() and not exists(select 1 from club_app.eligibility_reviews r join club_app.participant_eligibility e using(club_id,season_id,user_id) where r.club_id=c and r.season_id=s and r.user_id=participant and r.eligibility_revision=e.revision and lower(trim(r.guardian_name))=lower(trim(signer_name))) then raise exception 'Current agreement and authorized signer require organizer guardian review' using errcode='42501';end if;
 return club_app.sign_agreement_identity_impl(c,s,participant,waiver,expected_hash,signer_name,relationship,adult_signer,accepted);
end $$;
alter function club_app.approve_member(uuid,uuid,uuid) rename to approve_member_signed_impl;
revoke all on function club_app.approve_member_signed_impl(uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function club_app.approve_member(c uuid,s uuid,u uuid) returns text language plpgsql security definer set search_path='' as $$ declare result text;begin
 result=club_app.approve_member_signed_impl(c,s,u);
 if exists(select 1 from club_app.seasons where club_id=c and id=s and rules->>'operationsEnabled'='true') and not exists(select 1 from club_app.participant_eligibility e join club_app.eligibility_reviews r using(club_id,season_id,user_id) where e.club_id=c and e.season_id=s and e.user_id=u and e.revision=r.eligibility_revision) then raise exception 'Organizer must independently review birth date and guardian identity before approval';end if;
 return result;
end $$;
revoke all on function club_app.review_eligibility(uuid,uuid,uuid,int,text,text,boolean),club_app.signing_options(),club_app.sign_agreement(uuid,uuid,uuid,uuid,text,text,text,boolean,boolean),club_app.approve_member(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function club_app.review_eligibility(uuid,uuid,uuid,int,text,text,boolean),club_app.signing_options(),club_app.sign_agreement(uuid,uuid,uuid,uuid,text,text,text,boolean,boolean),club_app.approve_member(uuid,uuid,uuid) to authenticated;
commit;
