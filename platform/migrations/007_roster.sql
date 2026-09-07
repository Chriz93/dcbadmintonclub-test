begin;
-- Minimal display roster; never includes email, phone, waiver or health fields.
create function club_app.club_roster(c uuid) returns table(user_id uuid,display_name text,kind text) language plpgsql stable security definer set search_path='' as $$ begin
 if not (club_app.is_member(c) or club_app.is_admin(c)) then raise exception 'Forbidden' using errcode='42501';end if;
 return query select m.id,m.display_name,ms.kind from club_app.memberships ms join club_app.members m on m.id=ms.user_id where ms.club_id=c and ms.status='active' order by m.display_name,m.id;
end $$;
revoke all on function club_app.club_roster(uuid) from public,anon;
grant execute on function club_app.club_roster(uuid) to authenticated;
commit;
