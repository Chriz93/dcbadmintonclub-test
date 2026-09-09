-- Backfill approval, waitlist, registration date and membership type from the legacy JSON blobs into columns.
-- Idempotent; safe on TEST now and on production at cutover (run after L01).
begin;
with pa as (
 select (e.key)::bigint as id,e.value as v from public.app_state s cross join lateral jsonb_each(s.value::jsonb) e where s.key='player_approvals'
)
update public.players p set
 approved=coalesce((pa.v->>'approved')::boolean,p.approved),
 waitlisted=coalesce((pa.v->>'waitlisted')::boolean,p.waitlisted),
 membership_type=coalesce(nullif(pa.v->>'membershipType',''),p.membership_type),
 registered_at=coalesce(p.registered_at,nullif(pa.v->>'registeredAt','')::timestamptz),
 updated_at=now()
from pa where pa.id=p.id;
with mo as (
 select (e.key)::bigint as id,e.value as v from public.app_state s cross join lateral jsonb_each_text(s.value::jsonb) e where s.key='membership_overrides'
)
update public.players p set membership_type=mo.v,updated_at=now() from mo where mo.id=p.id and mo.v in ('regular','spare') and p.membership_type is distinct from mo.v;
update public.players set membership_type='regular' where membership_type is null or membership_type not in ('regular','spare');
-- Players never marked in the blob keep the column default (approved) only if they have played or hold a court; others start unapproved.
update public.players p set approved=false where approved and current_court=0 and games_played=0 and not exists(select 1 from public.app_state s where s.key='player_approvals' and (s.value::jsonb ? p.id::text));
commit;
select count(*) filter(where approved) approved,count(*) filter(where waitlisted) waitlisted,count(*) filter(where membership_type='spare') spares,count(*) filter(where registered_at is not null) dated from public.players;
