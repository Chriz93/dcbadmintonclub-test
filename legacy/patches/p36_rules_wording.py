# p36 (September 12, 2026): rule wording for 2026-27, everywhere it appears.
#  - Late rule: "Players arriving more than 5 minutes late move down one court." A late player already on the bottom
#    court in use stays there (there is no lower court). Replaces "more than 5 minutes late moves you to the last court".
#  - Shuttlecocks: two per player on each court (8 for four, 10 for five, 6 for three, 4 for two); players provide
#    extras. Home rules, registration rules, and the Session tab's hand-out form (each court's own number, a count above
#    it is refused, a court not in use is disabled).
#  - Removed: "Repeated unexcused absences may result in losing your spot to a waitlist player."
#  - Added: "The app can make mistakes. Please keep a note of your court's score for each round on your phone. If you
#    notice an error, send your recorded scores to the organizer on the same day, after the session." — on the Home
#    rules, the registration rules, the registration confirmation and the score-entry page.
#  - Payment acknowledgement: only on step 1 (the season-fee choice). The duplicate $400 / $20 boxes on the waiver step
#    are gone; step 2 needs only the waiver box and signature.
#  - Fees only where they apply: the Home rules line and the Schedule tile show a spare the $20 session fee and a
#    regular the $400 season fee (the organizer and visitors see both).
#  - Duplicate registration rule merged: the two "remaining shuttlecocks go to the top scorers" rules are now one.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)
def line_sub(contains, new):
    global s
    lines = s.split("\n"); hits = [i for i, l in enumerate(lines) if contains in l]
    assert len(hits) == 1, (len(hits), contains[:80])
    lines[hits[0]] = new; s = "\n".join(lines)

NOTE = "The app can make mistakes. Please keep a note of your court's score for each round on your phone. If you notice an error, send your recorded scores to the organizer on the same day, after the session."
LATE = "Arrive 5 minutes early. Players arriving more than 5 minutes late move down one court. On the bottom court in use there is no lower court, so a late player stays there."

# ── Home: season rules card ──
sub("""      • Regular season $400 (26 players). Spare session $20, confirmed once the admin verifies the e-transfer.<br>""",
    """      • <span id="rules-fee">Regular season $400 (26 players). Spare session $20, confirmed once the admin verifies the e-transfer.</span><br>""")
sub("""wins, even at 20–20 — no deuce. Arrive 5 minutes early; more than 5 minutes late moves you to the last court.<br>""",
    f"""wins, even at 20–20 — no deuce.<br>
      • {LATE}<br>
      • Shuttlecocks: two per player on each court — 8 for four players, 10 for five, 6 for three and 4 for two. Players provide any extra shuttlecocks.<br>""")
sub("""(the same result on every phone). Nobody moves down from the last court in use.
    </div>
  </div>""", f"""(the same result on every phone). Nobody moves down from the last court in use.<br>
      • <strong>{NOTE}</strong>
    </div>
  </div>""")

# ── Schedule tile: the fee that applies to the viewer ──
sub("""<div><div style="font-size:20px;font-weight:800;color:var(--teal2);">$400</div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">Season</div></div>""",
    """<div id="sched-fee"><div id="sched-fee-amt" style="font-size:20px;font-weight:800;color:var(--teal2);">$400</div><div id="sched-fee-lbl" style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">Season</div></div>""")

# ── Registration step 2: no second payment acknowledgement ──
line_sub('<div class="chk-row" id="w5-row"', "")
line_sub('<div class="chk-row" id="w6-row"', "")
s = s.replace("\n\n        <label class=\"lbl\" style=\"margin-top:8px;\">Digital Signature (type full name) *</label>", "\n        <label class=\"lbl\" style=\"margin-top:8px;\">Digital Signature (type full name) *</label>")
sub("""  const w5row=document.getElementById('w5-row');if(w5row)w5row.style.display=type==='regular'?'flex':'none';
  const w6row=document.getElementById('w6-row');if(w6row)w6row.style.display=type==='spare'?'flex':'none';
  // Uncheck the hidden one to avoid accidental validation pass
  if(type==='regular'){const cb=document.getElementById('w6');if(cb)cb.checked=false;}
  else{const cb=document.getElementById('w5');if(cb)cb.checked=false;}
}""", "}")
sub("""  // Show/hide payment checkboxes based on membership type
  const w5row=document.getElementById('w5-row');if(w5row)w5row.style.display=type==='regular'?'flex':'none';
  const w6row=document.getElementById('w6-row');if(w6row)w6row.style.display=type==='spare'?'flex':'none';
  goRS(2);""", "  goRS(2);")
sub("""  const checkboxes=['w1'];
  if(regData.membershipType==='regular')checkboxes.push('w5');
  else checkboxes.push('w6');
  if(!checkboxes.every(id=>document.getElementById(id)?.checked)){
    toast('Please check all required boxes to continue','warn');return;
  }""", """  // The payment acknowledgement is the season-fee choice on step 1; this step is the waiver alone.
  if(!document.getElementById('w1')?.checked){toast('Please tick the box to accept the waiver to continue','warn');return;}""")

# ── Registration step 3: league format rules ──
sub("""<li style="font-size:13px;line-height:1.5;">Arrive 5 minutes early. If late by more than 5 minutes, you will be moved to the last court.</li>""",
    f"""<li style="font-size:13px;line-height:1.5;">{LATE}</li>""")
sub("""<li style="font-size:13px;line-height:1.5;">Each court is allotted 8 shuttlecocks (2 per player). Extra shuttlecocks must be provided by players.</li>""",
    """<li style="font-size:13px;line-height:1.5;">Each court gets two shuttlecocks per player: 8 for a court of four, 10 for a court of five (6 for three, 4 for two). Players provide any extra shuttlecocks.</li>""")
sub("""(Game 1: A+B vs C+D · Game 2: A+C vs B+D · Game 3: A+D vs B+C).</li>""",
    f"""(Game 1: A+B vs C+D · Game 2: A+C vs B+D · Game 3: A+D vs B+C).</li>
          <li style="font-size:13px;line-height:1.5;"><strong>{NOTE}</strong></li>""")
sub("""<li style="font-size:13px;line-height:1.5;">Remaining shuttlecocks are distributed to top scorers per court starting from Court 1.</li>""",
    """<li style="font-size:13px;line-height:1.5;">At the end of each session, remaining shuttlecocks on each court are distributed to the top scorer(s) on that court.</li>""")
sub("""
          <li style="font-size:13px;line-height:1.5;">At the end of each session, remaining shuttlecocks on each court are distributed to the top scorer(s) on that court.</li>
          <li style="font-size:13px;line-height:1.5;">Registration through this app""", """
          <li style="font-size:13px;line-height:1.5;">Registration through this app""")
sub(""" Repeated unexcused absences may result in losing your spot to a waitlist player.</li>""", """</li>""")

# ── Registration step 4 and the score-entry page ──
sub("""        <div class="alert alert-success">✅ First session: <strong>Tuesday September 15, 2026 at 8:00 PM</strong></div>""",
    f"""        <div class="alert alert-success">✅ First session: <strong>Tuesday September 15, 2026 at 8:00 PM</strong></div>
        <div class="alert alert-info" id="reg-score-note">📝 {NOTE}</div>""")
sub("""    <select class="inp" id="sc-sel" onchange="renderScoreEntry()" style="margin:0;">""",
    f"""    <div id="score-note" style="font-size:12px;line-height:1.5;margin:0 0 8px;padding:8px 10px;border-radius:8px;background:var(--s2);border:1px solid var(--border);">📝 {NOTE}</div>
    <select class="inp" id="sc-sel" onchange="renderScoreEntry()" style="margin:0;">""")

# ── Session tab: shuttlecock hand-out, two per player on each court ──
sub("""const FEES={regularSeason:400,spareSession:20,absenceRefund:14,absenceNoticeHours:72,voteDeadlineHours:46,spareAskHours:72,facilityShuttles:2};""",
    """const FEES={regularSeason:400,spareSession:20,absenceRefund:14,absenceNoticeHours:72,voteDeadlineHours:46,spareAskHours:72,facilityShuttles:2};
const SHUTTLES_PER_PLAYER=2; // each court starts with two new shuttlecocks per player; players provide extras
function birdsAllotted(n){return n>=2?SHUTTLES_PER_PLAYER*n:0;}""")
line_sub("Each court started with 8 birds. Enter how many are left on each court.",
    """      <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">Each court starts with two shuttlecocks per player (8 for four players, 10 for five, 6 for three, 4 for two). Enter how many are left on each court; the top scorers on that court take them home.</div>""")
sub("""      <div>${[1,2,3,4,5,6].map(c=>`
        <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;">
          <label style="width:80px;font-size:12px;font-weight:700;">Court ${c}:</label>
          <input type="number" class="inp" id="birds_${c}" min="0" max="8" value="0" style="width:60px;padding:4px;">
          <span style="font-size:10px;color:var(--muted);">of 8 remaining</span>
        </div>
      `).join('')}""", """      <div>${[1,2,3,4,5,6].map(c=>{const n=(S.current.assignments[c]||[]).length,max=birdsAllotted(n);return `
        <div style="margin-bottom:8px;display:flex;gap:8px;align-items:center;">
          <label for="birds_${c}" style="width:80px;font-size:12px;font-weight:700;">Court ${c}:</label>
          <input type="number" class="inp" id="birds_${c}" min="0" max="${max}" value="0" ${max?'':'disabled'} style="width:60px;padding:4px;">
          <span id="birds_of_${c}" style="font-size:10px;color:var(--muted);">${max?`of ${max} remaining (${n} players × 2)`:'not in use'}</span>
        </div>
      `;}).join('')}""")
sub("""1 bird = top scorer · 2 = top 2 · 3 = top 3 · 4 = 1 each · 5+ = top gets extras</div>""",
    """One each to the players in order of wins this round, then any extras go round again from the top scorer.</div>""")
sub("""async function distributeBirds(){
  if(!S.current)return toast('No session','warn');
  const bd={};""", """async function distributeBirds(){
  if(!S.current)return toast('No session','warn');
  // Each court starts with two shuttlecocks per player: a count above that (or below zero) is a typing mistake.
  for(let c=1;c<=NC;c++){const el=document.getElementById(`birds_${c}`);if(!el||el.disabled)continue;const v=parseInt(el.value)||0,max=birdsAllotted((S.current.assignments[c]||[]).length);if(v<0||v>max)return toast(`Court ${c} started with ${max} shuttlecocks — enter a number from 0 to ${max}`,'warn');}
  const bd={};""")

# ── Fees only where they apply ──
sub("renderHome();renderRegPage();renderCourts();renderRoundTracker();renderSchedule();",
    "renderHome();renderRegPage();renderCourts();renderRoundTracker();renderSchedule();renderFeeLines();")
sub("""function renderAll(){
  checkRegistrationStatus();""", """// Fees only where they apply: a spare sees the $20 session fee, a regular the $400 season fee; the organizer and
// visitors without a player record see both.
function renderFeeLines(){
  const me=myPlayer(),org=!!S_me.organizer,spare=!org&&!!me&&me.membershipType==='spare',regular=!org&&!!me&&me.membershipType!=='spare';
  const both=`Regular season $${FEES.regularSeason} (${REGULAR_CAPACITY} players). Spare session $${FEES.spareSession}, confirmed once the admin verifies the e-transfer.`;
  const rf=document.getElementById('rules-fee');
  if(rf)rf.textContent=spare?`Spare session $${FEES.spareSession}, confirmed once the admin verifies the e-transfer.`:regular?`Regular season $${FEES.regularSeason} (${REGULAR_CAPACITY} players).`:both;
  const a=document.getElementById('sched-fee-amt'),l=document.getElementById('sched-fee-lbl');
  if(a&&l){a.textContent=spare?`$${FEES.spareSession}`:`$${FEES.regularSeason}`;l.textContent=spare?'Per session':'Season';}
}
function renderAll(){
  checkRegistrationStatus();""")
f.write_text(s)
print("p36 applied")
