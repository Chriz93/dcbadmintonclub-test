-- TEST only. Verified against the supplied permit, pages 2–4, September 6, 2026.
-- Keep session IDs and subscription UIDs unchanged. No participant waiver is published.
begin;
update club_app.clubs set name='Maplewood Advanced Badminton League',settings=settings||'{"feesPendingConfirmation":false,"registrationClosed":true,"regularFeeCents":40000,"spareFeeCents":2000}'::jsonb where id='10000000-0000-0000-0000-000000000001';
update club_app.seasons set name='Maplewood Advanced League 2026–27',regular_capacity=25,rules=rules||'{"requireIntake":true,"regularFeeCents":40000,"spareFeeCents":2000,"absenceNoticeHours":72,"facilityCashRefundCents":0,"facilityShuttleCredit":2,"playEndsMinutesBeforeBooking":10,"initialSeeding":"administrator","registrationClosed":true}'::jsonb where id='40000000-0000-0000-0000-000000000001' and club_id='10000000-0000-0000-0000-000000000001';
update club_app.permit_imports set source_name='p2026-07-21-0001.pdf',sha256='e26814b74362fb39c3288481ab0570a21a95f2b854515872488590c95667853b',preview=preview||'{"requiresPDFConfirmation":false,"verifiedFromOriginalPDF":true,"approvedBookings":28,"cancelledBookings":6,"bookedHours":56,"reviewDate":"2026-09-06","facilityRulesSha256":"637909d16d1b700c0e3c9ec3661c090571ce0197b589ffb9f6a59acdc1962dc1"}'::jsonb where id='70000000-0000-0000-0000-000000000001' and club_id='10000000-0000-0000-0000-000000000001';
commit;
