begin;
create function club_app.placement_penalties(c uuid,s uuid) returns table(user_id uuid) language plpgsql stable security definer set search_path='' as $$ begin
 if not club_app.is_scorekeeper(c) then raise exception 'Club scoring access required' using errcode='42501';end if;
 return query select distinct n.user_id from club_app.no_show_penalties n join club_app.sessions source on source.id=n.session_id and source.club_id=n.club_id join club_app.sessions target on target.id=s and target.club_id=c
 where n.club_id=c and n.status='pending' and source.season_id=target.season_id and source.starts_at<target.starts_at;
end $$;
create or replace function club_app.assign_reviewed_courts(c uuid,s uuid,round_number int,plan jsonb,expected_revision int,reason text,penalties_applied uuid[]) returns void language plpgsql security definer set search_path='' as $$ begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform 1 from club_app.sessions where club_id=c and id=s for update;
 if penalties_applied is null then raise exception 'Explicit reviewed penalties required';end if;
 if round_number<>1 and cardinality(penalties_applied)>0 then raise exception 'Penalties apply only to the opening round';end if;
 if round_number=1 then
 -- Replacement plans must explicitly re-confirm penalties; an omitted one becomes pending.
 update club_app.no_show_penalties set status='pending',applied_session=null,revision=revision+1 where club_id=c and applied_session=s and status='applied';
 end if;
 if exists(select 1 from unnest(penalties_applied) u where not exists(select 1 from club_app.placement_penalties(c,s) p where p.user_id=u)) then raise exception 'Penalty must be from an earlier session in this season';end if;
 if exists(select 1 from unnest(penalties_applied) u where not exists(select 1 from jsonb_array_elements(plan) p cross join lateral jsonb_array_elements_text(p->'players') x where x.value::uuid=u)) then raise exception 'Penalty player must be assigned';end if;
 perform club_app.assign_courts(c,s,round_number,plan,expected_revision,reason);
 if round_number=1 then
 update club_app.no_show_penalties n set status='applied',applied_session=s,revision=revision+1 where n.club_id=c and n.status='pending' and n.user_id=any(penalties_applied) and n.session_id=(select q.session_id from club_app.no_show_penalties q join club_app.sessions source on source.id=q.session_id join club_app.sessions target on target.id=s where q.club_id=c and q.user_id=n.user_id and q.status='pending' and source.season_id=target.season_id and source.starts_at<target.starts_at order by source.starts_at,q.session_id limit 1);
 end if;
end $$;
revoke all on function club_app.placement_penalties(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function club_app.placement_penalties(uuid,uuid) to authenticated;
commit;
