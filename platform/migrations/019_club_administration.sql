begin;
alter table club_app.clubs add column revision int not null default 0;
alter table club_app.announcements add column revision int not null default 1;
alter table club_app.announcements add column updated_at timestamptz not null default now();
create function club_app.save_club_settings(c uuid,expected_revision int,club_name text,contact_email text,accent text,reason text) returns void language plpgsql security definer set search_path='' as $$ declare old club_app.clubs;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select * into old from club_app.clubs where id=c for update;
 if not found or expected_revision is null or old.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if club_name is null or length(trim(club_name)) not between 2 and 100 or contact_email is null or contact_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or length(contact_email)>254 or accent is null or accent !~ '^#[a-fA-F0-9]{6}$' or reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Valid club settings and reason required';end if;
 update club_app.clubs set name=trim(club_name),settings=settings||jsonb_build_object('contactEmail',trim(contact_email),'accent',accent),revision=revision+1 where id=c;
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'club.settings_changed',to_jsonb(old),jsonb_build_object('name',club_name,'contactEmail',contact_email,'accent',accent,'reason',reason));
end $$;
create function club_app.create_season(c uuid,season_name text,venue_name text,address text,rooms text,court_count int,regular_capacity int,spare_capacity int,waitlist_capacity int,timezone text,normal_target int,five_target int,reason text) returns jsonb language plpgsql security definer set search_path='' as $$ declare se uuid;ve uuid;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform 1 from club_app.clubs where id=c for update;
 if season_name is null or length(trim(season_name)) not between 2 and 150 or venue_name is null or length(trim(venue_name)) not between 2 and 150 or address is null or length(trim(address)) not between 3 and 500 or rooms is null or length(trim(rooms)) not between 1 and 200 or court_count is null or court_count not between 1 and 50 or regular_capacity is null or regular_capacity not between 1 and 250 or spare_capacity is null or spare_capacity not between 0 and 250 or waitlist_capacity is null or waitlist_capacity not between 0 and 250 or normal_target is null or normal_target not between 1 and 99 or five_target is null or five_target not between 1 and 99 or not exists(select 1 from pg_timezone_names where name=timezone) or reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Valid season, venue, capacity, scoring and reason required';end if;
 if exists(select 1 from club_app.seasons where club_id=c and lower(name)=lower(trim(season_name))) then raise exception 'Season name already exists';end if;
 insert into club_app.venues(club_id,name,address,rooms) values(c,trim(venue_name),trim(address),trim(rooms)) returning id into ve;
 insert into club_app.courts(club_id,venue_id,number) select c,ve,n from generate_series(1,court_count) n;
 insert into club_app.seasons(club_id,name,timezone,regular_capacity,spare_capacity,waitlist_capacity,rules) values(c,trim(season_name),timezone,regular_capacity,spare_capacity,waitlist_capacity,jsonb_build_object('normalTarget',normal_target,'fiveTarget',five_target,'requireIntake',true,'operationsEnabled',true,'registrationClosed',true)) returning id into se;
 insert into club_app.audit_events(club_id,actor,action,after_value) values(c,auth.uid(),'season.created',jsonb_build_object('season',se,'venue',ve,'courts',court_count,'reason',reason));return jsonb_build_object('season',se,'venue',ve);
end $$;
create function club_app.save_announcement(c uuid,entry uuid,expected_revision int,title text,body text,is_public boolean,remove boolean,reason text) returns uuid language plpgsql security definer set search_path='' as $$ declare old club_app.announcements; saved uuid;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform 1 from club_app.clubs where id=c for update;
 if entry is not null then select * into old from club_app.announcements where club_id=c and id=entry for update;if not found then raise exception 'Announcement unavailable';end if;end if;
 if expected_revision is null or expected_revision<>coalesce(old.revision,0) then raise exception 'Revision conflict' using errcode='40001';end if;
 if remove is null or is_public is null or reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Explicit action and reason required';end if;
 if remove then
 if entry is null then raise exception 'Existing announcement required';end if;
 delete from club_app.announcements where club_id=c and id=entry;saved=entry;
 else
 if title is null or length(trim(title)) not between 2 and 150 or body is null or length(trim(body)) not between 2 and 5000 then raise exception 'Announcement text required';end if;
 if entry is null then insert into club_app.announcements(club_id,title,body,public) values(c,trim(title),trim(body),is_public) returning id into saved;
 else update club_app.announcements set title=trim(save_announcement.title),body=trim(save_announcement.body),public=is_public,revision=revision+1,updated_at=now() where club_id=c and id=entry returning id into saved;end if;
 end if;
 insert into club_app.audit_events(club_id,actor,action,before_value,after_value) values(c,auth.uid(),'announcement.changed',to_jsonb(old),jsonb_build_object('id',saved,'removed',remove,'reason',reason));return saved;
end $$;
-- Public projection deliberately exposes only reviewed public content and public contact settings.
create function club_app.public_club(club_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',c.name,'contactEmail',c.settings->>'contactEmail','accent',c.settings->>'accent','announcements',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'body',a.body) order by a.updated_at desc) from club_app.announcements a where a.club_id=c.id and a.public),'[]'::jsonb)) from club_app.clubs c where c.slug=club_slug
$$;
revoke all on function club_app.save_club_settings(uuid,int,text,text,text,text),club_app.create_season(uuid,text,text,text,text,int,int,int,int,text,int,int,text),club_app.save_announcement(uuid,uuid,int,text,text,boolean,boolean,text),club_app.public_club(text) from public,anon,authenticated;
grant execute on function club_app.save_club_settings(uuid,int,text,text,text,text),club_app.create_season(uuid,text,text,text,text,int,int,int,int,text,int,int,text),club_app.save_announcement(uuid,uuid,int,text,text,boolean,boolean,text) to authenticated;
grant execute on function club_app.public_club(text) to anon,authenticated;
commit;
