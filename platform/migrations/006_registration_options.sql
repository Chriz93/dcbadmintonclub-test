begin;
create function club_app.registration_options(club_slug text) returns table(club_id uuid,season_id uuid,season_name text,waiver_id uuid,waiver_body text) language sql stable security definer set search_path='' as $$
 select c.id,s.id,s.name,w.id,w.body from club_app.clubs c join club_app.seasons s on s.club_id=c.id cross join lateral (select id,body from club_app.waiver_versions where club_id=c.id order by version desc limit 1) w where c.slug=club_slug
$$;
revoke all on function club_app.registration_options(text) from public;
grant execute on function club_app.registration_options(text) to anon,authenticated;
commit;
