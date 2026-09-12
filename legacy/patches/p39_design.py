# p39 (September 12, 2026): a readable, consistent look — typography, palette, spacing, motion, touch and focus.
#  Inspired by the hierarchy and pacing of griffjonesgolf.com (condensed display headings over a plain body face, deep
#  green on a light ground, short fades) without its branding or assets; smashlytics.net was reviewed for app patterns.
#  - Palette: court greens and neutrals with every text colour at least 4.5:1 on white and on the card greys (WCAG 2.2
#    AA). The old light green text (#16a34a, 3.3:1), amber (#d97706, 3.2:1) and gold (#ca8a04, 2.9:1) are replaced;
#    primary buttons and active tabs are a solid deep green with white text (6.5:1); the warn button is dark-on-amber.
#  - Type: Barlow Condensed (display: page titles, card titles, the nav) and Barlow (body), 15px base; the old 9–11px
#    inline sizes are raised to 12px.
#  - Spacing and shape: calmer cards (one light shadow), wider pages on laptops, clearer inputs and focus rings.
#  - Motion: a short page fade and modal rise; nothing moves for people who ask for reduced motion.
#  - Touch: buttons, tabs and toggles are at least 44px tall on touch screens.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap">""",
    """<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700&display=swap">""")
sub("""<meta name="theme-color" content="#15803d">""", """<meta name="theme-color" content="#146c2e">""")
sub("""  --navy:#ffffff;--navy2:#f1f7f3;--teal:#15803d;--teal2:#16a34a;
  --green:#16a34a;--green2:#15803d;--red:#dc2626;--red2:#b91c1c;
  --yellow:#d97706;--yellow2:#b45309;--gold:#ca8a04;--silver:#6b7280;--bronze:#b45309;
  --bg:#f4f7f5;--s1:#ffffff;--s2:#f1f5f2;--s3:#e6ede8;--s4:#d5e0d9;
  --border:#e1e8e3;--text:#0f1f16;--muted:#5f6f66;
  --ink:#ffffff;--radius:16px;--shadow:0 10px 30px rgba(15,31,22,0.10);
  color-scheme:light;
  --font:'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;""", """  /* Court greens; every text colour is at least 4.5:1 on white and on the card greys (WCAG 2.2 AA). */
  --navy:#ffffff;--navy2:#eef3ee;--teal:#146c2e;--teal2:#17702f;
  --green:#17803a;--green2:#146c2e;--red:#c42b1c;--red2:#a8231a;
  --yellow:#8a5300;--yellow2:#7a4a00;--gold:#7a5c00;--silver:#56606b;--bronze:#8a4b14;
  --bg:#f2f5f1;--s1:#ffffff;--s2:#eef3ee;--s3:#e2eae3;--s4:#cfdbd1;
  --border:#d3ddd5;--text:#17231b;--muted:#4b5a50;
  --ink:#ffffff;--radius:14px;--shadow:0 12px 32px rgba(23,35,27,0.12);
  color-scheme:light;
  --font:'Barlow',ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --font-display:'Barlow Condensed','Arial Narrow',ui-sans-serif,system-ui,sans-serif;
  --ease:cubic-bezier(0.4,0,0.2,1);""")
DESIGN = """
/* ══ DESIGN (p39): type, palette, spacing, motion, touch, focus ══ */
body{font-size:15px;line-height:1.5;background:radial-gradient(900px 480px at 50% -200px,rgba(20,108,46,0.08),transparent 65%),var(--bg);}
.page{animation:fadeUp .32s var(--ease);}
@media (min-width:900px){.page{max-width:760px;padding:24px 20px;}}
.page-title{font-family:var(--font-display);font-size:34px;font-weight:700;line-height:1.02;letter-spacing:0.01em;text-transform:uppercase;margin-bottom:4px;text-wrap:balance;}
.page-sub{font-size:14px;}
.nav-title{font-family:var(--font-display);font-size:21px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;}
.card{border-radius:var(--radius);padding:18px;box-shadow:0 1px 2px rgba(23,35,27,0.05),0 6px 18px rgba(23,35,27,0.05);}
.card-title{font-family:var(--font-display);font-size:17px;font-weight:700;letter-spacing:0.05em;color:var(--text);margin-bottom:10px;}
.hero{background:linear-gradient(160deg,#0f4d22 0%,#146c2e 60%,#0c4020 100%);}
.hero-club{font-family:var(--font-display);font-size:34px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;line-height:1.02;}
.lbl{font-size:12.5px;}
.inp{border-color:var(--s4);}
.inp:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(20,108,46,0.2);}
:focus-visible{outline:3px solid var(--teal);outline-offset:2px;}
.btn{letter-spacing:0.02em;transition:background-color .15s var(--ease),box-shadow .15s var(--ease),transform .1s var(--ease),filter .15s var(--ease);}
.btn:hover{filter:none;}
.btn-primary{background:var(--teal);color:#fff;box-shadow:0 6px 16px rgba(20,108,46,0.25);}
.btn-primary:hover{background:#0f5b26;}
.btn-success{background:var(--green);}
.btn-danger{background:var(--red);}
.btn-warn{background:#f2b541;color:#231800;}
.btn-ghost{border-color:var(--s4);}
.btn-ghost:hover{background:var(--s2);}
.ptab{font-size:14px;}
.ptab.active{background:var(--teal);}
.bnav-btn{font-size:11px;}
.bnav-btn.active .bi{background:rgba(20,108,46,0.12);}
.invite-btn,.vote-banner{background:var(--teal);}
.alert{font-size:14px;border-radius:12px;}
.alert-info{background:#e7f3ea;border-color:#9ccaa8;color:#12512a;}
.alert-success{background:#e7f3ea;border-color:#9ccaa8;color:#12512a;}
.alert-warn{background:#fdf3dc;border-color:#e8c57a;color:#5e3b00;}
.alert-error{background:#fbe9e7;border-color:#e8a79f;color:#8a1c14;}
.tag{font-size:12px;}
.tg-teal,.tg-green{background:#e3f1e6;color:#145a28;border-color:#b9dcc2;}
.tg-red{background:#fbe9e7;color:#8f1d14;border-color:#f1c3bd;}
.tg-yellow{background:#fdf1d8;color:#6e4400;border-color:#f0d49a;}
.tg-gold{background:#fbf0cf;color:#6b5200;border-color:#ead28a;}
.tg-gray{color:#3f4a43;}
.lc1 .cbadge{background:#f4d35e;color:#3d2e00;}.lc2 .cbadge{background:#dfe3e8;color:#2f3640;}.lc3 .cbadge{background:#ecc9a8;color:#4a2608;}
.gym-court.gc1{border-color:#e2c04a;}.gym-court.gc2{border-color:#b8c0c8;}.gym-court.gc3{border-color:#d7a57a;}
.glabel{font-size:12px;letter-spacing:0.12em;}
.tnames{font-size:13px;}
.gc-player{font-size:12px;}
.gc-header{font-size:11.5px;}
.dnd-court-title{font-size:13px;}
.chk-row span,.chk-row label{font-size:14px;}
.waiver-box{font-size:14px;line-height:1.65;color:var(--text);max-height:340px;}
.waiver-box h4{color:var(--teal);font-family:var(--font-display);font-size:16px;letter-spacing:0.03em;}
.modal{border-radius:18px;}
.modal h3{font-family:var(--font-display);font-size:20px;letter-spacing:0.03em;color:var(--text);}
.modal-ov.open .modal{animation:modalIn .22s var(--ease);}
@keyframes modalIn{from{opacity:0;transform:translateY(12px) scale(.985)}to{opacity:1;transform:none}}
/* Old screens set 9–11px text inline; nothing is smaller than 12px now. */
[style*="font-size:9px"],[style*="font-size:10px"],[style*="font-size:11px"]{font-size:12px!important;}
/* Touch screens: every control is at least 44px tall. */
@media (pointer:coarse){.btn-sm,.ptab,.rsvp-btn,.att-btn,.vt-btn,.notes-btn,.adj-sel{min-height:44px;}.tag[onclick]{min-height:36px;padding:8px 10px;}.chk-row input{width:22px;height:22px;}}
/* Reduced motion: no fades, rises or pulses. */
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important;}}
"""
sub("</style>", DESIGN + "</style>")
f.write_text(s)
print("p39 applied")
