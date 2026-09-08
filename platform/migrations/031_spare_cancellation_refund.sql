begin;
-- Organizer decision, September 8: a confirmed spare whose session the school cancels gets the
-- full $20 back as a pending reconciliation ledger entry instead of physical shuttles.
alter function club_app.cancel_session(uuid,uuid,int) rename to cancel_session_regular_impl;
revoke all on function club_app.cancel_session_regular_impl(uuid,uuid,int) from public,anon,authenticated,service_role;
create function club_app.cancel_session(c uuid,s uuid,expected_revision int) returns void language plpgsql security definer set search_path='' as $$ declare fee int;begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 perform club_app.cancel_session_regular_impl(c,s,expected_revision);
 select coalesce((se.rules->>'spareFeeCents')::int,2000) into fee from club_app.sessions ss join club_app.seasons se on se.id=ss.season_id where ss.id=s and ss.club_id=c and se.rules->>'operationsEnabled'='true';
 if fee is null then return;end if;
 update club_app.session_accounts a set status='void',revision=a.revision+1,updated_at=now() from club_app.spare_requests q where a.club_id=c and a.session_id=s and a.kind='shuttle_credit' and a.status='pending' and q.club_id=a.club_id and q.session_id=a.session_id and q.user_id=a.user_id and q.status='confirmed';
 insert into club_app.session_accounts(club_id,session_id,user_id,kind,cents) select c,s,q.user_id,'spare_reconciliation',fee from club_app.spare_requests q where q.club_id=c and q.session_id=s and q.status='confirmed' and q.paid_at is not null
 on conflict(club_id,session_id,user_id,kind) do update set cents=excluded.cents,status='pending',revision=club_app.session_accounts.revision+1,updated_at=now() where club_app.session_accounts.status='void';
end $$;
revoke all on function club_app.cancel_session(uuid,uuid,int) from public,anon,authenticated,service_role;
grant execute on function club_app.cancel_session(uuid,uuid,int) to authenticated;
commit;
