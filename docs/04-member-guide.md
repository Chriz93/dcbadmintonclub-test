# Member guide

The local preview contains synthetic players. Practice scores do not affect real club results.

Use Season schedule to see approved dates and cancellations. Download ICS to import into Apple Calendar or another calendar app; Google Calendar links add individual sessions. A live subscription URL is not deployed yet, so file downloads do not automatically deliver future updates.

For a configured test account, open Member hub, enter your registered email and verify the one-time code. Choose your club and session, select Attending, Not attending, Maybe, Late or Need a spare, and optionally add a note. Save once; if the response is uncertain, retry the same payload safely. If another device changed your response, reload before editing. Capacity and your confirmed/waitlisted state come from the database.

Opt in to transactional email using Email preferences. Clear the checkbox and save to unsubscribe. The local release never sends real member email. Signing out clears the in-memory session. Refreshing also requires sign-in; no private records or tokens are stored in localStorage.

The courtside screen currently demonstrates rotation with synthetic players. Games on five-player courts target 15 points; each of five games rests one player. Do not use practice scores as official results. Offline mode is read-only. Full profile/waiver/results and registration screens are still being integrated.

In connected test mode, use **Load my profile and results** to read your own display name, phone, completed-season statistics and waiver acceptance timestamps. **Save my profile** only updates your own record. Connected Schedule reads current database bookings; its subscription link currently points to the local test feed and is not a publicly hosted calendar.
