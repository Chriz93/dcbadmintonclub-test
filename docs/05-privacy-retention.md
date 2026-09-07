# Privacy and data retention — proposed operational policy

Status: implementation guidance for club review, not a determination of legal retention obligations.

Public: club name, venue, schedule, cancellations, public rules. Private: identity, contact information, medical/emergency fields, waivers, RSVP notes and preferences. The new profile table is readable only by its owner; administrators do not automatically get medical/contact details. Member-facing scores contain IDs but no private contact fields. Auth user identity is global; each membership and club-owned business record carries a tenant ID.

Minimize collection: do not request medical notes or drawn signatures unless the club defines a specific purpose and access/retention rule. New registration schema retains versioned waiver acceptance and server timestamp. Existing data must remain in an encrypted migration quarantine until reviewed, never in synthetic staging fixtures or source control.

Suggested configurable retention, pending club approval: delete transient delivery payloads after 30 days; keep minimal delivery receipts for 90 days; purge old rate-limit buckets after 48 hours; expire request-id ledgers only after retry windows close; review inactive registrations at season end; separately approve waiver/financial retention. Scheduled purge tooling is not deployed in this release. Audits must avoid optional RSVP-note contents; logs must omit credentials and sensitive payloads.

`export_my_data()` returns only the caller's profile, memberships, RSVPs, waivers and preferences. Store downloaded exports privately and remove them when no longer needed. `request_my_deletion()` records a request and disables that person's notification preferences across their own memberships. It does not falsely claim immediate erasure: an operator must review shared-club links, mandatory retention, backups and Auth identity deletion. Completed deletions should pseudonymize results and record a minimal completion audit. Full automated erasure remains a release blocker.

Backups: encrypted, access-controlled, offsite; exclude from Git and web roots. Separate recipients from decryption identities; retain decryption keys outside the application. Rehearse restore and enforce backup expiration. Never put a production member export in this test project. The source archives created for this change contain source only, not a database export.
