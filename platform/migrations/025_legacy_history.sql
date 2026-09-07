begin;
create table club_app.legacy_archives(id uuid primary key default gen_random_uuid(),club_id uuid not null references club_app.clubs(id),label text not null,source_text text not null,sha256 text not null,imported_by uuid not null references auth.users(id),created_at timestamptz not null default now(),unique(club_id,id),unique(club_id,sha256));
create table club_app.legacy_identity_links(club_id uuid not null,archive_id uuid not null,legacy_id text not null,user_id uuid not null,linked_by uuid not null references auth.users(id),reason text not null,created_at timestamptz not null default now(),primary key(club_id,archive_id,legacy_id),unique(club_id,archive_id,user_id),foreign key(club_id,archive_id) references club_app.legacy_archives(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id));
alter table club_app.legacy_archives enable row level security;
alter table club_app.legacy_identity_links enable row level security;
create policy legacy_admin on club_app.legacy_archives for select to authenticated using(club_app.is_admin(club_id));
create policy legacy_link_read on club_app.legacy_identity_links for select to authenticated using(user_id=auth.uid() or club_app.is_admin(club_id));
revoke all on club_app.legacy_archives,club_app.legacy_identity_links from public,anon,authenticated;
grant select on club_app.legacy_archives,club_app.legacy_identity_links to authenticated;
create function club_app.archive_legacy_history(c uuid,label text,source_text text,expected_hash text) returns uuid language plpgsql security definer set search_path='' as $$ declare payload jsonb;digest text;result uuid;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if label is null or length(trim(label)) not between 5 and 150 or source_text is null or octet_length(source_text)>20000000 then raise exception 'Valid label and export up to 20 MB required';end if;
 payload=source_text::jsonb;
 if jsonb_typeof(payload) is distinct from 'object' or jsonb_typeof(payload->'players') is distinct from 'array' then raise exception 'Legacy snapshot with players required';end if;
 if jsonb_typeof(coalesce(payload#>'{kv,completed_sessions}',payload->'sessions','[]'::jsonb)) is distinct from 'array' then raise exception 'Completed sessions must be an array';end if;
 digest=encode(sha256(convert_to(source_text,'UTF8')),'hex');if expected_hash is distinct from digest then raise exception 'Source checksum mismatch';end if;
 insert into club_app.legacy_archives(club_id,label,source_text,sha256,imported_by) values(c,trim(label),source_text,digest,auth.uid()) on conflict(club_id,sha256) do nothing returning id into result;
 if result is null then select id into result from club_app.legacy_archives a where a.club_id=c and a.sha256=digest;return result;end if;
 insert into club_app.audit_events(club_id,actor,action,after_value) values(c,auth.uid(),'legacy.archived',jsonb_build_object('archive',result,'sha256',digest));return result;
end $$;
create function club_app.link_legacy_identity(c uuid,se uuid,archive uuid,legacy_id text,u uuid,reason text) returns void language plpgsql security definer set search_path='' as $$ declare payload jsonb;old_email text;verified_email text;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 if reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Identity review reason required';end if;
 select a.source_text::jsonb into payload from club_app.legacy_archives a where a.club_id=c and a.id=archive for update;if not found then raise exception 'Archive unavailable';end if;
 if (select count(*) from jsonb_array_elements(payload->'players') p where p->>'id'=legacy_id)<>1 then raise exception 'Legacy identity is missing or ambiguous';end if;
 select lower(trim(p->>'email')) into old_email from jsonb_array_elements(payload->'players') p where p->>'id'=legacy_id;
 select lower(trim(email)) into verified_email from auth.users where id=u and email_confirmed_at is not null;
 if old_email is null or old_email='' or old_email is distinct from verified_email or (select count(*) from jsonb_array_elements(payload->'players') p where lower(trim(p->>'email'))=old_email)<>1 then raise exception 'Unique matching verified email required; resolve changed or ambiguous identities separately';end if;
 if not exists(select 1 from club_app.seed_candidates(c,se) p where p.user_id=u) then raise exception 'Approved registration and current season signature required';end if;
 insert into club_app.legacy_identity_links(club_id,archive_id,legacy_id,user_id,linked_by,reason) values(c,archive,legacy_id,u,auth.uid(),trim(reason));
 insert into club_app.audit_events(club_id,actor,subject,action,after_value) values(c,auth.uid(),u,'legacy.identity_linked',jsonb_build_object('archive',archive,'legacy_id',legacy_id,'reason',trim(reason)));
end $$;
create function club_app.my_legacy_matches(page_number int default 0) returns table(id text,archive_label text,session_label text,court int,round int,game int,score_a int,score_b int,on_a boolean,partner text,opponents text,needs_review boolean) language plpgsql stable security definer set search_path='' as $$ begin
 if auth.uid() is null or page_number is null or page_number not between 0 and 1000 then raise exception 'Sign in and use a valid page';end if;
 return query with sources as(select a.id archive,a.label,a.source_text::jsonb payload,l.legacy_id from club_app.legacy_archives a join club_app.legacy_identity_links l on l.club_id=a.club_id and l.archive_id=a.id where l.user_id=auth.uid()),
 sessions as(select s.*,x.value session,x.ordinality session_order from sources s cross join lateral jsonb_array_elements(coalesce(s.payload#>'{kv,completed_sessions}',s.payload->'sessions','[]'::jsonb)) with ordinality x),
 games as(select s.*,g.key,g.value score,regexp_match(g.key,'^c([1-9][0-9]{0,2})_y([1-9][0-9]{0,2})_g([1-9][0-9]{0,2})$') positions from sessions s cross join lateral jsonb_each(case when jsonb_typeof(s.session->'scores')='object' then s.session->'scores' else '{}'::jsonb end) g where s.legacy_id in (g.value->>'a1',g.value->>'a2',g.value->>'b1',g.value->>'b2')),
 parsed as(select g.*,case when score->>'sA' ~ '^[0-9]{1,3}$' then (score->>'sA')::int end sa,case when score->>'sB' ~ '^[0-9]{1,3}$' then (score->>'sB')::int end sb,legacy_id in (score->>'a1',score->>'a2') own_a from games g)
 select archive::text||':'||session_order||':'||key,label,coalesce(session->>'date','Undated session'),positions[1]::int,positions[2]::int,positions[3]::int,sa,sb,coalesce(own_a,false),
 coalesce((select string_agg(coalesce(session->'playerNames'->>p.pid,(select coalesce(m->>'name',m->>'display_name') from jsonb_array_elements(payload->'players')m where m->>'id'=p.pid limit 1),'Former player'),', ') from unnest(case when own_a then array[score->>'a1',score->>'a2'] else array[score->>'b1',score->>'b2'] end) p(pid) where p.pid is not null and p.pid<>legacy_id),'Singles'),
 (select string_agg(coalesce(session->'playerNames'->>p.pid,(select coalesce(m->>'name',m->>'display_name') from jsonb_array_elements(payload->'players')m where m->>'id'=p.pid limit 1),'Former player'),', ') from unnest(case when own_a then array[score->>'b1',score->>'b2'] else array[score->>'a1',score->>'a2'] end) p(pid) where p.pid is not null),
 sa is null or sb is null or greatest(sa,sb)<>21 or sa=sb or positions is null or (score ? 'w' and score->>'w' is distinct from case when sa>sb then 'A' when sb>sa then 'B' else 'T' end) or (select count(*)<>count(distinct pid) from unnest(array[score->>'a1',score->>'a2',score->>'b1',score->>'b2']) p(pid) where pid is not null)
 from parsed order by archive,session_order desc,key limit 50 offset page_number*50;
end $$;
revoke all on function club_app.archive_legacy_history(uuid,text,text,text),club_app.link_legacy_identity(uuid,uuid,uuid,text,uuid,text),club_app.my_legacy_matches(int) from public,anon,authenticated,service_role;
grant execute on function club_app.archive_legacy_history(uuid,text,text,text),club_app.link_legacy_identity(uuid,uuid,uuid,text,uuid,text),club_app.my_legacy_matches(int) to authenticated;
create function club_app.legacy_archive_players(c uuid,archive uuid) returns table(legacy_id text,display_name text,linked boolean) language plpgsql stable security definer set search_path='' as $$ begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 return query select p->>'id',coalesce(p->>'name',p->>'display_name','Unnamed legacy player'),exists(select 1 from club_app.legacy_identity_links l where l.club_id=c and l.archive_id=archive and l.legacy_id=p->>'id') from club_app.legacy_archives a cross join lateral jsonb_array_elements(a.source_text::jsonb->'players') p where a.club_id=c and a.id=archive limit 2000;
end $$;
revoke all on function club_app.legacy_archive_players(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function club_app.legacy_archive_players(uuid,uuid) to authenticated;
commit;
