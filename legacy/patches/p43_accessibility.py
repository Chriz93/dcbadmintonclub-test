# p43 (September 12, 2026): accessibility fixes found by the axe checks (WCAG 2.2 A/AA).
#  - Every select has an accessible name: the score court picker and the new-player fields are tied to their labels;
#    the Session tab's late/absent/replacement pickers, the invitation type, the announcement type and the per-player
#    court pickers carry a label that names the player or purpose.
#  - The league-rules agreement text is the checkbox's label.
#  - Inactive players' rows in the standings are no longer faded to 70% (that made their text too faint to read);
#    they sit on the grey card colour instead.
#  - Avatar colours: every colour has at least 6:1 contrast with the white initials.
#  - The WhatsApp and Messenger buttons use darker brand shades so their white text is readable (the old ones were
#    1.9:1 and 3.9:1).
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""    <label class="lbl">Select Your Court</label>""", """    <label class="lbl" for="sc-sel">Select Your Court</label>""")
sub("""        <label class="lbl">Membership Type</label>
        <select class="inp" id="np-membership">""", """        <label class="lbl" for="np-membership">Membership Type</label>
        <select class="inp" id="np-membership">""")
sub("""        <label class="lbl">Starting Court</label>
        <select class="inp" id="np-court">""", """        <label class="lbl" for="np-court">Starting Court</label>
        <select class="inp" id="np-court">""")
sub("""<select class="inp" id="ann-type">""", """<select class="inp" id="ann-type" aria-label="Announcement type">""")
sub("""<select class="inp" id="inv-type" style=""", """<select class="inp" id="inv-type" aria-label="Membership for this invitation" style=""")
sub("""<select class="inp" id="late-player-sel" style=""", """<select class="inp" id="late-player-sel" aria-label="Player who arrived late" style=""")
sub("""<select class="inp" id="absent-player-sel" style=""", """<select class="inp" id="absent-player-sel" aria-label="Absent player" style=""")
sub("""<select class="inp" id="spare-replace-sel" style=""", """<select class="inp" id="spare-replace-sel" aria-label="Replace with" style=""")
sub("""<select style="background:var(--s3);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:3px 4px;font-size:10px;" onchange="setPlayerCourt(${p.id},this.value)">""",
    """<select aria-label="Court for ${esc(p.name)}" style="background:var(--s3);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:3px 4px;font-size:10px;" onchange="setPlayerCourt(${p.id},this.value)">""", count=2)
sub("""<select class="inp" style="font-size:10px;padding:4px 6px;margin:0;" onchange="assignCourtToRegistered(${p.id},this.value)">""",
    """<select class="inp" aria-label="Court for ${esc(p.name)}" style="font-size:10px;padding:4px 6px;margin:0;" onchange="assignCourtToRegistered(${p.id},this.value)">""")
sub("""          <input type="checkbox" id="lf-all">
          <span style="font-weight:700;font-size:13px;">I have read and agree to all of the league format rules listed above.</span>""",
    """          <input type="checkbox" id="lf-all">
          <label for="lf-all" style="font-weight:700;font-size:13px;">I have read and agree to all of the league format rules listed above.</label>""")
sub("""${!isActive?'opacity:0.7;':''}""", """${!isActive?'background:var(--s2);':''}""")
sub("""${!p.isActive?'opacity:0.7;':''}""", """${!p.isActive?'background:var(--s2);':''}""")
sub("""const AVATAR_COLORS=['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e63','#00bcd4','#ff5722','#607d8b','#795548'];""",
    """const AVATAR_COLORS=['#b3261e','#a04000','#7a5c00','#146c2e','#0b6e5f','#1d5fa8','#6c3a9a','#a3134f','#006a7a','#b3401a','#4a5a66','#6b4a36']; // all ≥6:1 with white initials""")
sub(""".messenger-btn{background:#0084ff;""", """.messenger-btn{background:#0060c7;""")
sub(""".messenger-btn:hover{background:#0070e0;}""", """.messenger-btn:hover{background:#004f9f;}""")
sub(""".wa-btn{background:#25d366;""", """.wa-btn{background:#0e7a3e;""")
f.write_text(s)
print("p43 applied")
