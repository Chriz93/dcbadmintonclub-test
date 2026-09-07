begin;
create table club_app.session_accounts(
 id uuid primary key default gen_random_uuid(),club_id uuid not null,session_id uuid not null,user_id uuid not null,
 kind text not null check(kind in ('absence_refund','shuttle_credit','spare_reconciliation')),
 cents int not null default 0 check(cents between 0 and 100000),shuttles int not null default 0 check(shuttles between 0 and 100),
 status text not null default 'pending' check(status in ('pending','settled','void')),revision int not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(club_id,session_id,user_id,kind),foreign key(club_id,session_id) references club_app.sessions(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id)
);
create table club_app.spare_requests(
 club_id uuid not null,session_id uuid not null,user_id uuid not null,voted_at timestamptz not null default now(),expires_at timestamptz not null,
 payment_reference text not null check(length(payment_reference) between 1 and 200),paid_at timestamptz,verified_by uuid references auth.users(id),
 status text not null default 'payment_pending' check(status in ('payment_pending','confirmed','withdrawn','expired','reconciliation')),
 revision int not null default 1,primary key(club_id,session_id,user_id),foreign key(club_id,session_id) references club_app.sessions(club_id,id),foreign key(club_id,user_id) references club_app.memberships(club_id,user_id)
);
alter table club_app.session_accounts enable row level security;
alter table club_app.spare_requests enable row level security;
create policy account_read on club_app.session_accounts for select to authenticated using(user_id=auth.uid() or club_app.is_admin(club_id));
create policy spare_read on club_app.spare_requests for select to authenticated using(user_id=auth.uid() or club_app.is_admin(club_id));
revoke all on club_app.session_accounts,club_app.spare_requests from public,anon,authenticated;
grant select on club_app.session_accounts,club_app.spare_requests to authenticated;
create function club_app.spare_vacancies(c uuid,s uuid) returns int language sql stable security definer set search_path='' as $$
 select greatest(0,se.capacity-(select count(*) from club_app.registrations r join club_app.memberships m on m.club_id=r.club_id and m.user_id=r.user_id where r.club_id=c and r.season_id=se.season_id and r.status='approved' and m.status='active' and m.kind='regular' and not exists(select 1 from club_app.rsvps v where v.club_id=c and v.session_id=s and v.user_id=r.user_id and v.response in ('not_attending','need_spare')))-(select count(*) from club_app.spare_requests q where q.club_id=c and q.session_id=s and q.status='confirmed'))::int from club_app.sessions se where se.club_id=c and se.id=s
$$;
create function club_app.request_spare(c uuid,s uuid,payment_reference text,expected_revision int) returns int language plpgsql security definer set search_path='' as $$ declare se club_app.sessions; old club_app.spare_requests; v int;begin
 perform club_app.throttle();select * into se from club_app.sessions where club_id=c and id=s for update;
 if not found or se.status<>'scheduled' or now()>=se.starts_at then raise exception 'Spare voting closed';end if;
 if not exists(select 1 from club_app.registrations r join club_app.memberships m on m.club_id=r.club_id and m.user_id=r.user_id where r.club_id=c and r.season_id=se.season_id and r.user_id=auth.uid() and r.status='approved' and m.status='active' and m.kind='spare') then raise exception 'Approved spare membership required' using errcode='42501';end if;
 if payment_reference is null or length(trim(payment_reference)) not between 1 and 200 or expected_revision is null or expected_revision<0 then raise exception 'Payment reference and revision required';end if;
 select * into old from club_app.spare_requests where club_id=c and session_id=s and user_id=auth.uid() for update;
 if coalesce(old.revision,0)<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if old.paid_at is not null then raise exception 'Verified payment must be corrected by administrator';end if;
 if club_app.spare_vacancies(c,s)<=0 then raise exception 'No vacancy available';end if;
 v=coalesce(old.revision,0)+1;
 insert into club_app.spare_requests(club_id,session_id,user_id,expires_at,payment_reference,revision) values(c,s,auth.uid(),least(se.starts_at,now()+interval '24 hours'),trim(payment_reference),v)
 on conflict(club_id,session_id,user_id) do update set payment_reference=excluded.payment_reference,revision=excluded.revision,status='payment_pending',voted_at=now(),expires_at=excluded.expires_at;
 insert into club_app.audit_events(club_id,actor,subject,action,after_value) values(c,auth.uid(),auth.uid(),'spare.voted',jsonb_build_object('session',s,'revision',v));return v;
end $$;
create function club_app.verify_spare(c uuid,s uuid,u uuid,expected_revision int,reason text) returns text language plpgsql security definer set search_path='' as $$ declare se club_app.sessions; q club_app.spare_requests; result text;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select * into se from club_app.sessions where club_id=c and id=s for update;if not found then raise exception 'Session unavailable';end if;
 select * into q from club_app.spare_requests where club_id=c and session_id=s and user_id=u for update;
 if not found or expected_revision is null or q.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Payment verification reason required';end if;
 if q.paid_at is not null then raise exception 'Payment already verified';end if;
 result=case when se.status='scheduled' and now()<se.starts_at and now()<q.expires_at and q.status='payment_pending' and club_app.spare_vacancies(c,s)>0 then 'confirmed' else 'reconciliation' end;
 update club_app.spare_requests set status=result,paid_at=now(),verified_by=auth.uid(),revision=revision+1 where club_id=c and session_id=s and user_id=u;
 if result='confirmed' then
 insert into club_app.rsvps values(c,s,u,'attending','','confirmed',1,auth.uid(),now()) on conflict(club_id,session_id,user_id) do update set response='attending',placement='confirmed',revision=club_app.rsvps.revision+1,changed_by=auth.uid(),changed_at=now();
 else
 insert into club_app.session_accounts(club_id,session_id,user_id,kind,cents) values(c,s,u,'spare_reconciliation',2000) on conflict do nothing;
 end if;
 insert into club_app.audit_events(club_id,actor,subject,action,before_value,after_value) values(c,auth.uid(),u,'spare.payment_verified',to_jsonb(q),jsonb_build_object('session',s,'status',result,'reason',trim(reason)));
 perform club_app.enqueue(c,u,'spare:'||s||':'||u||':'||(q.revision+1),'spare.'||result,jsonb_build_object('session',s));return result;
end $$;
create function club_app.adjust_account(c uuid,entry uuid,expected_revision int,new_status text,new_cents int,new_shuttles int,reason text) returns void language plpgsql security definer set search_path='' as $$ declare old club_app.session_accounts;begin
 perform club_app.throttle();if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 select * into old from club_app.session_accounts where club_id=c and id=entry for update;
 if not found or expected_revision is null or old.revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001';end if;
 if reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Correction reason required';end if;
 update club_app.session_accounts set cents=new_cents,shuttles=new_shuttles,status=new_status,revision=revision+1,updated_at=now() where id=entry;
 insert into club_app.audit_events(club_id,actor,subject,action,before_value,after_value) values(c,auth.uid(),old.user_id,'account.corrected',to_jsonb(old),jsonb_build_object('id',entry,'status',new_status,'cents',new_cents,'shuttles',new_shuttles,'reason',reason));
end $$;
alter function club_app.submit_rsvp(uuid,uuid,uuid,text,text,int,uuid) rename to submit_rsvp_impl;
revoke all on function club_app.submit_rsvp_impl(uuid,uuid,uuid,text,text,int,uuid) from public,anon,authenticated,service_role;
create function club_app.submit_rsvp(c uuid,s uuid,u uuid,response text,note text,expected_revision int,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare se club_app.sessions; operations_active boolean; was_replay boolean; result jsonb;begin
 if expected_revision is null or expected_revision<0 or request_id is null then raise exception 'Revision and request ID required';end if;
 select * into se from club_app.sessions where club_id=c and id=s for update;
 select coalesce((rules->>'operationsEnabled')::boolean,false) into operations_active from club_app.seasons where id=se.season_id;
 if operations_active then
 if not exists(select 1 from club_app.registrations r join club_app.memberships m on m.club_id=r.club_id and m.user_id=r.user_id where r.club_id=c and r.season_id=se.season_id and r.user_id=u and r.status='approved' and m.kind='regular') then raise exception 'Regular registration required; spares use paid booking' using errcode='42501';end if;
 if response in ('attending','late') and exists(select 1 from club_app.session_accounts where club_id=c and session_id=s and user_id=u and kind='absence_refund' and status='settled') then raise exception 'Settled refund requires administrator reconciliation';end if;
 if response in ('attending','late') and exists(select 1 from club_app.rsvps where club_id=c and session_id=s and user_id=u and club_app.rsvps.response in ('not_attending','need_spare')) and club_app.spare_vacancies(c,s)<=0 then raise exception 'Place filled; administrator must reconcile attendance';end if;
 end if;
 was_replay=exists(select 1 from club_app.requests where club_id=c and actor=auth.uid() and key=request_id);
 result=club_app.submit_rsvp_impl(c,s,u,response,note,expected_revision,request_id);
 if was_replay then return result;end if;
 if operations_active and not exists(select 1 from club_app.session_accounts where club_id=c and session_id=s and user_id=u and kind='absence_refund' and status='settled') then
 if response in ('not_attending','need_spare') and now()<=se.starts_at-interval '72 hours' and exists(select 1 from club_app.member_intake where club_id=c and season_id=se.season_id and user_id=u and payment_status='verified' and claimed_amount_cents>=40000) then
 insert into club_app.session_accounts(club_id,session_id,user_id,kind,cents) values(c,s,u,'absence_refund',1400) on conflict(club_id,session_id,user_id,kind) do update set status='pending',revision=club_app.session_accounts.revision+1,updated_at=now() where club_app.session_accounts.status='void';
 elsif response not in ('not_attending','need_spare') then
 update club_app.session_accounts set status='void',revision=revision+1,updated_at=now() where club_id=c and session_id=s and user_id=u and kind='absence_refund' and status='pending';
 end if;end if;
 return result;
end $$;
create or replace function club_app.cancel_session(c uuid,s uuid,expected_revision int) returns void language plpgsql security definer set search_path='' as $$ declare se club_app.sessions;begin
 if expected_revision is null or expected_revision<0 then raise exception 'Valid revision required';end if;
 select * into se from club_app.sessions where club_id=c and id=s for update;
 perform club_app.cancel_session_impl(c,s,expected_revision);
 if se.status<>'cancelled' and exists(select 1 from club_app.seasons where id=se.season_id and rules->>'operationsEnabled'='true') then
 insert into club_app.session_accounts(club_id,session_id,user_id,kind,shuttles)
 select c,s,r.user_id,'shuttle_credit',2 from club_app.registrations r join club_app.memberships m on m.club_id=r.club_id and m.user_id=r.user_id where r.club_id=c and r.season_id=se.season_id and r.status='approved' and ((m.kind='regular' and not exists(select 1 from club_app.rsvps v where v.club_id=c and v.session_id=s and v.user_id=r.user_id and v.response in ('not_attending','need_spare'))) or exists(select 1 from club_app.spare_requests q where q.club_id=c and q.session_id=s and q.user_id=r.user_id and q.status='confirmed')) on conflict do nothing;
 end if;
end $$;
create function club_app.attendance_overview(c uuid,s uuid) returns table(user_id uuid,display_name text,response text,attendance text,kind text) language plpgsql stable security definer set search_path='' as $$ begin
 if not club_app.is_admin(c) then raise exception 'Administrator MFA required' using errcode='42501';end if;
 return query select m.user_id,p.display_name,coalesce(v.response,'no_response'),coalesce(a.status,'not_checked'),m.kind from club_app.sessions se join club_app.registrations r on r.club_id=se.club_id and r.season_id=se.season_id join club_app.memberships m on m.club_id=r.club_id and m.user_id=r.user_id join club_app.members p on p.id=m.user_id left join club_app.rsvps v on v.club_id=c and v.session_id=s and v.user_id=m.user_id left join club_app.attendance a on a.club_id=c and a.session_id=s and a.user_id=m.user_id where se.club_id=c and se.id=s and r.status='approved' and m.status='active';
end $$;
create function club_app.queue_due_reminders() returns int language plpgsql security definer set search_path='' as $$ declare r record; stage text; total int=0;begin
 update club_app.spare_requests set status='expired',revision=revision+1 where status='payment_pending' and expires_at<=now();
 for r in select s.club_id,s.id,s.starts_at,reg.user_id from club_app.sessions s join club_app.seasons se on se.id=s.season_id join club_app.registrations reg on reg.club_id=s.club_id and reg.season_id=s.season_id join club_app.memberships m on m.club_id=reg.club_id and m.user_id=reg.user_id where se.rules->>'operationsEnabled'='true' and s.status='scheduled' and reg.status='approved' and m.kind='regular' and m.status='active' and s.starts_at>now()+interval '72 hours' and s.starts_at<=now()+interval '7 days' and not exists(select 1 from club_app.rsvps v where v.club_id=s.club_id and v.session_id=s.id and v.user_id=reg.user_id and v.response<>'maybe') loop
 stage=case when r.starts_at<=now()+interval '78 hours' then 'final' when r.starts_at<=now()+interval '96 hours' then 'reminder' else 'open' end;
 perform club_app.enqueue(r.club_id,r.user_id,'attendance:'||r.id||':'||r.user_id||':'||stage,'attendance.'||stage,jsonb_build_object('session',r.id));total=total+1;
 end loop;return total;
end $$;
revoke all on function club_app.spare_vacancies(uuid,uuid),club_app.request_spare(uuid,uuid,text,int),club_app.verify_spare(uuid,uuid,uuid,int,text),club_app.adjust_account(uuid,uuid,int,text,int,int,text),club_app.submit_rsvp(uuid,uuid,uuid,text,text,int,uuid),club_app.attendance_overview(uuid,uuid),club_app.queue_due_reminders() from public,anon,authenticated,service_role;
grant execute on function club_app.request_spare(uuid,uuid,text,int),club_app.verify_spare(uuid,uuid,uuid,int,text),club_app.adjust_account(uuid,uuid,int,text,int,int,text),club_app.submit_rsvp(uuid,uuid,uuid,text,text,int,uuid),club_app.attendance_overview(uuid,uuid) to authenticated;
grant execute on function club_app.queue_due_reminders() to service_role;
commit;
