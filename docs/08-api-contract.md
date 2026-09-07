# API contract v1 (staging)

Transport: Supabase PostgREST RPC in `club_app`, Bearer Auth token + publishable project key. Member IDs in request bodies do not establish identity. The database compares `auth.uid()` and role membership; privileged admin actions also require JWT assurance `aal2`. Private table writes are not granted to browser roles.

| Operation | Contract | Concurrency / result |
|---|---|---|
| `submit_rsvp` | club, session, subject UUID; five response values; note <=500; expected revision; request UUID | Session lock, unique member RSVP, atomic audit/outbox. Same request/payload returns original result; altered payload rejected; stale revision SQLSTATE 40001 |
| `submit_score` | club/match UUID, integer A/B, expected revision | Match lock, scorekeeper/admin, active session, exact configured target, revision conflict on replay |
| `assign_courts` | club/session, round, JSON court/player plan, expected session revision, reason | Admin MFA, tenant/venue membership validation, unique players, 2–5 per court, atomic match generation and audit/notifications; scored round overrides rejected |
| `check_in` | club/session/member, present/absent/late/excused | Scorekeeper/admin, active membership, transaction and audit |
| `complete_session` | club/session, expected revision | Admin MFA, all games scored, season lock and normalized aggregate recomputation |
| `cancel_session` | club/session, expected revision | Admin MFA, status update, audit and consent-filtered outbox in one transaction |
| `import_permit` | club/season/venue UUIDs, permit number, filename/hash, UTC rows, expected count/hours, confirmed=true | Admin MFA, atomic validation, duplicate guard, provenance; repeat identical confirmed import returns existing ID |
| `set_preference` | club, enabled | Authenticated own consent timestamp; email only |
| `register_member` | club/season, display name, waiver UUID | Requires verified Auth email, pending membership/registration, waiver acceptance timestamp |
| `approve_member` | club/season/member | Admin MFA, season lock, registration/waiver checks; capacity-aware decision |
| `export_my_data` / `request_my_deletion` | no subject parameter | Own identity only; deletion request disables own notices, pending reviewed erasure |
| `public_schedule` | club slug | Public fields only; no member data |

Queue claim/recipient/finish functions are service-role-only. No browser receives provider/service credentials. Direct requests to unauthorized relations fail even if UI controls are modified.

Compatibility: these are initial unlaunched v1 contracts. Preserve function signatures or add a versioned successor after release. Future HTTP API should expose `/api/v1/` and enforce origin, request-size and failed-request rate limits at the gateway. Current DB throttling limits successful authenticated calls to 30/minute; transaction rollback means rejected calls do not consume its counter. Supabase Auth/gateway rate limits must be configured and tested separately. No claim of complete rate-abuse protection is made.

`club_roster(c)` returns only active member IDs, display names and membership kind to an authorized club member/admin. It never returns contact or health fields. Mutating versioned session RPCs reject null/negative revisions; `_impl` functions are private and not callable with browser roles. Permit import rejects missing totals and missing booking status.

Local subscription endpoint: `GET|HEAD /calendar/{club-slug}.ics`. It reads only `public_schedule`, returns standard ICS with persisted calendar UID + club slug, cancellation status and revision sequence, supports weak ETags/304 and returns 503/no-store when the source fails. It exposes no private member data. External HTTPS hosting remains a release gate.
