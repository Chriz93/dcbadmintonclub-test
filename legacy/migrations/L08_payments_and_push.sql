-- Payment ledger and push subscriptions.
-- * payments: every e-transfer, spare fee, refund or adjustment as a row; players.paid is derived from it.
-- * push_subscriptions: browser push endpoints a player registered; the reminder job uses them, players own them.
begin;
create table if not exists public.payments(id bigint generated always as identity primary key,player_id bigint not null references public.players(id) on delete cascade,kind text not null check(kind in ('season','spare','refund','adjustment')),amount numeric(8,2) not null check(amount>=0),session_number int,method text not null default 'e-transfer',received_on date not null default current_date,note text not null default '' check(length(note)<=300),created_by uuid,created_at timestamptz not null default now());
alter table public.payments enable row level security;
revoke all on public.payments from public,anon;
create policy "own payments" on public.payments for select to authenticated using(player_id=public.my_player_id() or public.is_admin());
grant select on public.payments to authenticated;
create index if not exists payments_player_idx on public.payments(player_id);

-- Season-fee status derives from the ledger: paid once season payments (plus adjustments) reach the fee for regulars, or once any spare fee exists for spares. Absence refunds are money out and never unpay a season.
create or replace function public.refresh_paid_flag(p_player bigint) returns void language sql security definer set search_path='' as $$
 update public.players p set paid=(
   case when coalesce(p.membership_type,'regular')='spare'
     then exists(select 1 from public.payments x where x.player_id=p.id and x.kind='spare')
     else coalesce((select sum(amount) from public.payments x where x.player_id=p.id and x.kind in('season','adjustment')),0)>=400
   end),updated_at=now()
 where p.id=p_player
$$;
create or replace function public.record_payment(p_player bigint,p_kind text,p_amount numeric,p_session int default null,p_received_on date default current_date,p_note text default '') returns bigint language plpgsql security definer set search_path='' as $$ declare pid bigint;begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 if not exists(select 1 from public.players where id=p_player) then raise exception 'Unknown player';end if;
 insert into public.payments(player_id,kind,amount,session_number,received_on,note,created_by) values(p_player,p_kind,p_amount,p_session,coalesce(p_received_on,current_date),coalesce(p_note,''),auth.uid()) returning id into pid;
 perform public.refresh_paid_flag(p_player);
 insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'payment.recorded',p_player::text,jsonb_build_object('id',pid,'kind',p_kind,'amount',p_amount,'session',p_session));
 return pid;
end $$;
create or replace function public.delete_payment(p_id bigint) returns void language plpgsql security definer set search_path='' as $$ declare pl bigint;begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 delete from public.payments where id=p_id returning player_id into pl;
 if pl is not null then perform public.refresh_paid_flag(pl); insert into public.audit_log(actor,action,subject,detail) values(auth.uid(),'payment.deleted',pl::text,jsonb_build_object('id',p_id)); end if;
end $$;
revoke all on function public.record_payment(bigint,text,numeric,int,date,text) from public,anon;
revoke all on function public.delete_payment(bigint) from public,anon;
revoke all on function public.refresh_paid_flag(bigint) from public,anon,authenticated;
grant execute on function public.record_payment(bigint,text,numeric,int,date,text) to authenticated;
grant execute on function public.delete_payment(bigint) to authenticated;

create table if not exists public.push_subscriptions(id bigint generated always as identity primary key,player_id bigint not null references public.players(id) on delete cascade,endpoint text not null unique check(length(endpoint)<=2000),p256dh text not null,auth text not null,user_agent text not null default '',created_at timestamptz not null default now());
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public,anon,authenticated;
create policy "own subscriptions" on public.push_subscriptions for select to authenticated using(player_id=public.my_player_id());
grant select on public.push_subscriptions to authenticated;
create or replace function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_user_agent text default '') returns void language plpgsql security definer set search_path='' as $$ declare pid bigint;begin
 pid=public.my_player_id();if pid is null then raise exception 'No player record' using errcode='42501';end if;
 if p_endpoint is null or p_endpoint not like 'https://%' then raise exception 'Invalid subscription';end if;
 insert into public.push_subscriptions(player_id,endpoint,p256dh,auth,user_agent) values(pid,p_endpoint,p_p256dh,p_auth,left(coalesce(p_user_agent,''),200))
 on conflict(endpoint) do update set player_id=excluded.player_id,p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,created_at=now();
end $$;
create or replace function public.delete_push_subscription(p_endpoint text) returns void language sql security definer set search_path='' as $$
 delete from public.push_subscriptions where endpoint=p_endpoint and player_id=public.my_player_id()
$$;
revoke all on function public.save_push_subscription(text,text,text,text) from public,anon;
revoke all on function public.delete_push_subscription(text) from public,anon;
grant execute on function public.save_push_subscription(text,text,text,text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
-- The reminder job (service role) reads subscriptions for the players it is about to remind and drops dead endpoints.
grant select,delete on public.push_subscriptions to service_role;
grant select on public.payments to service_role;
commit;
