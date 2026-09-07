begin;
create function club_app.promote_paid_spares(c uuid,s uuid) returns void language plpgsql security definer set search_path='' as $$ declare candidate club_app.spare_requests;begin
 perform 1 from club_app.sessions where club_id=c and id=s and status='scheduled' and starts_at>now() for update;if not found then return;end if;
 while club_app.spare_vacancies(c,s)>0 loop
 select q.* into candidate from club_app.spare_requests q where q.club_id=c and q.session_id=s and q.status='reconciliation' and q.paid_at is not null and q.expires_at>now() and not exists(select 1 from club_app.session_accounts a where a.club_id=c and a.session_id=s and a.user_id=q.user_id and a.kind='spare_reconciliation' and a.status='settled') and exists(select 1 from club_app.registrations r join club_app.sessions se on se.season_id=r.season_id and se.club_id=r.club_id where se.id=s and r.user_id=q.user_id and r.status='approved') order by greatest(q.voted_at,q.paid_at),q.user_id limit 1 for update;
 if not found then exit;end if;
 update club_app.spare_requests set status='confirmed',revision=revision+1 where club_id=c and session_id=s and user_id=candidate.user_id;
 update club_app.session_accounts set status='void',revision=revision+1,updated_at=now() where club_id=c and session_id=s and user_id=candidate.user_id and kind='spare_reconciliation' and status='pending';
 insert into club_app.rsvps values(c,s,candidate.user_id,'attending','','confirmed',1,candidate.verified_by,now()) on conflict(club_id,session_id,user_id) do update set response='attending',placement='confirmed',revision=club_app.rsvps.revision+1,changed_at=now(),changed_by=candidate.verified_by;
 insert into club_app.audit_events(club_id,actor,subject,action,after_value) values(c,candidate.verified_by,candidate.user_id,'spare.promoted',jsonb_build_object('session',s,'priority_at',greatest(candidate.voted_at,candidate.paid_at)));
 perform club_app.enqueue(c,candidate.user_id,'spare-promoted:'||s||':'||candidate.user_id||':'||(candidate.revision+1),'spare.confirmed',jsonb_build_object('session',s));
 end loop;
end $$;
create function club_app.withdraw_spare(c uuid,s uuid,expected_revision int,note text) returns void language plpgsql security definer set search_path='' as $$ declare q club_app.spare_requests; se club_app.sessions;begin
 perform club_app.throttle();select * into se from club_app.sessions where club_id=c and id=s for update;
 if not found or se.status<>'scheduled' or now()>=se.starts_at then raise exception 'Contact administrator for this session';end if;
 select * into q from club_app.spare_requests where club_id=c and session_id=s and user_id=auth.uid() for update;
 if not found or expected_revision is null or q.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if note is null or length(trim(note)) not between 1 and 500 then raise exception 'Withdrawal note required';end if;
 if q.status='withdrawn' then return;end if;
 update club_app.spare_requests set status='withdrawn',revision=revision+1 where club_id=c and session_id=s and user_id=auth.uid();
 update club_app.rsvps set response='not_attending',placement='none',revision=revision+1,changed_at=now(),changed_by=auth.uid() where club_id=c and session_id=s and user_id=auth.uid();
 if q.status='confirmed' and now()<=se.starts_at-interval '72 hours' then
 insert into club_app.session_accounts(club_id,session_id,user_id,kind,cents) values(c,s,auth.uid(),'absence_refund',1400) on conflict do nothing;
 end if;
 insert into club_app.audit_events(club_id,actor,subject,action,before_value,after_value) values(c,auth.uid(),auth.uid(),'spare.withdrawn',to_jsonb(q),jsonb_build_object('session',s,'note',note));
 perform club_app.promote_paid_spares(c,s);
end $$;
alter function club_app.queue_due_reminders() rename to queue_due_reminders_impl;
revoke all on function club_app.queue_due_reminders_impl() from public,anon,authenticated,service_role;
create function club_app.queue_due_reminders() returns int language plpgsql security definer set search_path='' as $$ declare s record; u record; n int;begin
 n=club_app.queue_due_reminders_impl();
 for s in select se.club_id,se.id,se.season_id from club_app.sessions se join club_app.seasons season on season.id=se.season_id where se.status='scheduled' and se.starts_at>now() and se.starts_at<now()+interval '7 days' and season.rules->>'operationsEnabled'='true' loop
 perform club_app.promote_paid_spares(s.club_id,s.id);
 if club_app.spare_vacancies(s.club_id,s.id)>0 then
 for u in select m.user_id from club_app.memberships m join club_app.registrations r on r.club_id=m.club_id and r.user_id=m.user_id where m.club_id=s.club_id and m.kind='spare' and m.status='active' and r.season_id=s.season_id and r.status='approved' loop
 perform club_app.enqueue(s.club_id,u.user_id,'spare-vacancy:'||s.id||':'||u.user_id,'spare.available',jsonb_build_object('session',s.id));end loop;
 end if;end loop;return n;
end $$;
revoke all on function club_app.promote_paid_spares(uuid,uuid),club_app.withdraw_spare(uuid,uuid,int,text),club_app.queue_due_reminders() from public,anon,authenticated,service_role;
grant execute on function club_app.withdraw_spare(uuid,uuid,int,text) to authenticated;
grant execute on function club_app.queue_due_reminders() to service_role;
commit;
