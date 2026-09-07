begin;
create table club_app.privacy_reviews(club_id uuid not null,user_id uuid not null,reviewed_by uuid not null references auth.users(id),reviewed_at timestamptz not null default now(),note text not null,revision int not null default 1,primary key(club_id,user_id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
alter table club_app.privacy_reviews enable row level security;
create policy privacy_review_read on club_app.privacy_reviews for select to authenticated using(user_id=auth.uid() or club_app.is_admin(club_id));
revoke all on club_app.privacy_reviews from public,anon,authenticated;
grant select on club_app.privacy_reviews to authenticated;
create function club_app.privacy_review_queue(c uuid) returns table(user_id uuid,display_name text,requested_at timestamptz,review_note text,revision int) language plpgsql stable security definer set search_path='' as $$ begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 return query select d.user_id,m.display_name,d.requested_at,r.note,coalesce(r.revision,0) from club_app.deletion_requests d join club_app.memberships ms on ms.user_id=d.user_id and ms.club_id=c join club_app.members m on m.id=d.user_id left join club_app.privacy_reviews r on r.club_id=c and r.user_id=d.user_id where d.status<>'completed' order by d.requested_at;
end $$;
create function club_app.record_privacy_review(c uuid,u uuid,expected_revision int,note text) returns void language plpgsql security definer set search_path='' as $$ declare old club_app.privacy_reviews;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform 1 from club_app.memberships where club_id=c and user_id=u for update;
 if not found or not exists(select 1 from club_app.deletion_requests where user_id=u) then raise exception 'Club deletion request unavailable';end if;
 select * into old from club_app.privacy_reviews where club_id=c and user_id=u for update;
 if expected_revision is null or coalesce(old.revision,0)<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if note is null or length(trim(note)) not between 10 and 2000 then raise exception 'Record the retention decision and next action';end if;
 insert into club_app.privacy_reviews(club_id,user_id,reviewed_by,note,revision) values(c,u,auth.uid(),trim(note),coalesce(old.revision,0)+1) on conflict(club_id,user_id) do update set reviewed_by=excluded.reviewed_by,reviewed_at=now(),note=excluded.note,revision=excluded.revision;
 insert into club_app.audit_events(club_id,actor,subject,action,before_value,after_value) values(c,auth.uid(),u,'privacy.reviewed',to_jsonb(old),jsonb_build_object('note',note));
end $$;
revoke all on function club_app.privacy_review_queue(uuid),club_app.record_privacy_review(uuid,uuid,int,text) from public,anon;
grant execute on function club_app.privacy_review_queue(uuid),club_app.record_privacy_review(uuid,uuid,int,text) to authenticated;
alter function club_app.export_my_data() rename to export_my_data_impl;
revoke all on function club_app.export_my_data_impl() from public,anon,authenticated,service_role;
create function club_app.export_my_data() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 return club_app.export_my_data_impl()||jsonb_build_object(
 'privacy_reviews',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from club_app.privacy_reviews r where user_id=auth.uid()),
 'assignments',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from club_app.assignments r where user_id=auth.uid()),
 'rankings',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from club_app.rankings r where user_id=auth.uid()),
 'ratings',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from club_app.elo_ratings r where user_id=auth.uid()));
end $$;
revoke all on function club_app.export_my_data() from public,anon;
grant execute on function club_app.export_my_data() to authenticated;
commit;
