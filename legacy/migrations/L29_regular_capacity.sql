-- L29 (5 October 2026): the organizer can add a regular place to the season.
--
-- From the organizer: "admin should be able to approve the waitlist and make a player regular, even if the cap is
-- reached". p100 does that in the app, but the database refused it underneath, in two places:
--   * set_state('player_approvals'/'membership_overrides', …) — "Regular places are full; keep the player on the
--     waitlist" once the approved regulars reach regular_capacity;
--   * add_league_player(…, 'regular') — "Regular places are full".
-- So the app would have asked the organizer to confirm and then failed with a database error.
--
-- The cap is a season setting and the only way to change it was start_new_season, which archives the season. This
-- migration adds one function so the number can be moved during a season, by the organizer, on the record:
--
--   set_regular_capacity(p_capacity int) -> int
--
-- Organizer only (aal2, like every other admin function). Bounded 2..30, the same range start_new_season validates.
-- It will not be set below the regulars already approved, so the setting can never contradict the roster. Every change
-- is written to audit_log with the old and new number. Nothing else changes: the cap still stops the registration form
-- overfilling the season — at whatever number the organizer has set.
begin;

create or replace function public.set_regular_capacity(p_capacity int) returns int language plpgsql security definer set search_path='' as $$
declare st public.app_state; cfg jsonb; was int; have int;
begin
 if not public.is_admin() then raise exception 'Organizer verification required' using errcode='42501';end if;
 if p_capacity is null or p_capacity not between 2 and 30 then raise exception 'Regular places must be a number from 2 to 30';end if;
 perform pg_advisory_xact_lock(7262026);
 select * into st from public.app_state where key='season_config' for update;
 if st.key is null then raise exception 'No season is configured';end if;
 cfg=st.value::jsonb;
 was=coalesce((cfg->>'regular_capacity')::int,0);
 select count(*) into have from public.players where archived_at is null and approved and not waitlisted and membership_type='regular';
 if p_capacity<have then raise exception 'There are already % regular members; the number cannot be set below that',have;end if;
 if p_capacity=was then return was;end if;
 update public.app_state set value=(cfg||jsonb_build_object('regular_capacity',p_capacity))::text,version=version+1,updated_at=now() where key='season_config';
 insert into public.audit_log(actor,action,subject,detail)
  values(auth.uid(),'season.capacity',p_capacity::text,jsonb_build_object('was',was,'now',p_capacity,'regulars',have));
 return p_capacity;
end $$;
revoke all on function public.set_regular_capacity(int) from public,anon,service_role;
grant execute on function public.set_regular_capacity(int) to authenticated;
alter function public.set_regular_capacity(int) set lock_timeout = '5s';
alter function public.set_regular_capacity(int) set statement_timeout = '20s';

commit;
