begin;
alter table club_app.notification_deliveries drop constraint notification_deliveries_status_check;
alter table club_app.notification_deliveries add constraint notification_deliveries_status_check check(status in ('pending','processing','accepted','delivered','failed','suppressed'));
create or replace function club_app.finish_delivery(delivery_id uuid,attempt int,outcome text,provider_id text default null) returns void language plpgsql security definer set search_path='' as $$ begin
 if outcome is null or outcome not in ('pending','accepted','delivered','suppressed','failed') or (outcome in ('accepted','delivered') and provider_id is null) then raise exception 'Invalid outcome';end if;
 update club_app.notification_deliveries set status=case when outcome='pending' and attempts>=8 then 'failed' else outcome end,provider_message_id=provider_id,failure_reason=case when outcome in ('pending','failed') then 'Provider delivery failed or needs reconciliation' else null end,available_at=now()+make_interval(secs=>least(86400,30*power(2,attempts-1))::int),lease_until=null where id=delivery_id and attempts=attempt and status='processing';
 if not found then raise exception 'Stale delivery lease';end if;
end $$;
commit;
