# p30 (September 11, 2026): 26 regular players; any court can take a fifth player; the written rules match the app.
#  - REGULAR_CAPACITY 26 (every "(25/25)" message now reads from it).
#  - Seating: courts hold four; with more than 24 playing, the extras become a fifth player on the bottom courts — Court 6,
#    then 5, then 4. (26 regulars previously put SIX players on Court 6, which has no game schedule.) Used by Start
#    Session, the next-week preview and both Re-sort buttons; their "across N courts" count no longer says 7.
#  - A court of five plays five games to 15 wherever it is (already true in the app and database scoring).
#  - Court tally: players on a court of five play four games, so a 4-0 night no longer shows "4W · -1L".
#  - Rules on Home and in registration: two ladder rounds then free play; 15-point games on courts of five; how ties and
#    moves are decided; nobody moves down from the last court in use.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("const REGULAR_CAPACITY=25;", "const REGULAR_CAPACITY=26;")
sub("""function courtCap(c){return c===NC?5:4;}""", """function courtCap(c){return 5;}                    // any court can take a fifth player (then it plays five games to 15)
// Courts hold four; with more than 24 playing, the extras become a fifth player on the bottom courts (Court 6, then 5, then 4…).
function courtSizes(n){const s={};for(let c=1;c<=NC;c++)s[c]=0;if(n<=NC*4){for(let c=1;c<=NC&&n>0;c++){s[c]=Math.min(4,n);n-=s[c];}}else{const extra=Math.min(n-NC*4,NC);for(let c=1;c<=NC;c++)s[c]=4+(c>NC-extra?1:0);}return s;}
function fillCourts(ids){const z=courtSizes(ids.length),a={};let i=0;for(let c=1;c<=NC;c++){a[c]=ids.slice(i,i+z[c]);i+=z[c];}if(i<ids.length)a[NC].push(...ids.slice(i));return a;}""")
sub("""  sorted.forEach((p,i)=>{const c=Math.min(Math.floor(i/4)+1,NC);a[c].push(p.id);});""", """  Object.assign(a,fillCourts(sorted.map(p=>p.id)));""")
sub("""  const sorted=[...activePlayers()].sort((a,b)=>a.currentCourt-b.currentCourt);
  const updates=[];""", """  const sorted=[...activePlayers()].sort((a,b)=>a.currentCourt-b.currentCourt);
  const _fa=fillCourts(sorted.map(p=>p.id)),_courtOf=id=>{for(let c=1;c<=NC;c++)if(_fa[c].includes(id))return c;return NC;};
  const updates=[];""")
sub("""    const newCourt=Math.min(Math.floor(i/4)+1,NC);""", """    const newCourt=_courtOf(p.id);""")
sub("""    sorted.forEach((p,i)=>{const c=Math.min(Math.floor(i/4)+1,NC);na[c].push(p.id);});""", """    Object.assign(na,fillCourts(sorted.map(p=>p.id)));""")
sub("""  sorted.forEach((p,i)=>{const c=Math.min(Math.floor(i/4)+1,NC);na[c].push(p.id);});""", """  Object.assign(na,fillCourts(sorted.map(p=>p.id)));""")
sub("""  toast(`Courts re-sorted — ${sorted.length} players across ${Math.ceil(sorted.length/4)} courts`,'success');""",
    """  toast(`Courts re-sorted — ${sorted.length} players across ${Object.values(_fa).filter(x=>x.length).length} courts`,'success');""")
sub("""  const courtsUsed=Math.ceil(total/4);""", """  const courtsUsed=Object.values(na).filter(x=>x.length).length;""")
sub("""  const maxWins=players.length===3?2:3;""", """  const maxWins=players.length===5?4:players.length===3?2:3;   // on a court of five each player plays four of the five games""")
sub("""Court ${c} (${courtPids.length}/${courtCap(c)})</div>`;""", """Court ${c} (${courtPids.length}/${Math.max(4,courtPids.length)})</div>`;""")
# capacity messages
sub("""toast('Regular slots full (25/25). Please choose Spare.','warn')""", """toast(`Regular slots full (${REGULAR_CAPACITY}/${REGULAR_CAPACITY}). Please choose Spare.`,'warn')""")
sub("""toast('Regular slots full (25/25). Cannot switch to Regular.','warn')""", """toast(`Regular slots full (${REGULAR_CAPACITY}/${REGULAR_CAPACITY}). Cannot switch to Regular.`,'warn')""")
sub("""toast('Still no open regular slots (25/25)','warn')""", """toast(`Still no open regular slots (${REGULAR_CAPACITY}/${REGULAR_CAPACITY})`,'warn')""")
sub("""confirm('Regular slots are FULL (25/25). You will be added to the WAITLIST and notified if a spot opens. Continue?')""",
    """confirm(`Regular slots are FULL (${REGULAR_CAPACITY}/${REGULAR_CAPACITY}). You will be added to the WAITLIST and notified if a spot opens. Continue?`)""")
sub("""confirm('⚠️ Regular slots are FULL (25/25). Approve this player and add to WAITLIST instead?')""",
    """confirm(`⚠️ Regular slots are FULL (${REGULAR_CAPACITY}/${REGULAR_CAPACITY}). Approve this player and add to WAITLIST instead?`)""")
# rules on Home
sub("""      • Regular season $400 (25 players). Spare session $20""", """      • Regular season $400 (26 players). Spare session $20""")
sub("""      • When all 25 play, Court 6 runs five players rotating through five games to 15; other courts play three games to 21. Everyone rests once and the first rest rotates each week.<br>""",
    """      • Courts hold four. When more than 24 play (all 26 regulars, or a spare joins), the extra players become a fifth player on the bottom courts — Court 6 first, then Court 5, then Court 4. A court of five plays five doubles games to <strong>15 points</strong> and each player sits out one; a court of four plays three games to 21.<br>
      • Every session is <strong>two ladder rounds</strong>. After the second round the courts are free for casual games or drills (use old shuttlecocks).<br>""")
sub("""      • The admin sets the initial seeding; results then move players up and down one court. Ties are settled automatically (head-to-head, then points conceded).""",
    """      • The admin sets the initial seeding. After each round the player with the most wins on a court moves up one court and the fewest moves down; ties go to points, then point difference, then a coin toss. Nobody moves down from the last court in use.""")
# rules in registration (league format)
sub("""Games are played to 21 points. First to reach 21 wins, even at 20-20. No deuce.""", """Games are played to 21 points — 15 on a court of five. First to reach the target wins, even at 20-20 (14-14 on a court of five). No deuce.""")
sub("""The top scorer per court moves UP, the lowest scorer moves DOWN each round — no exceptions.""",
    """After each round, the player with the most wins on each court moves UP one court and the player with the fewest moves DOWN (ties: points, then point difference, then a coin toss). Nobody moves down from the last court in use.""")
sub("""Each session has multiple rounds. The number of rounds depends on available time and is decided by the admin. All courts must complete their games before the next round begins.""",
    """Each session has two ladder rounds; every court finishes a round before the next begins. After the second round, courts are free for casual games or drills.""")
sub("""3 players play 3 singles games; 2 players play best-of-3 singles.""", """3 players play 3 singles games; 2 players play best-of-3 singles. When more than 24 play, the extra players join the bottom courts as a fifth player (Court 6, then 5, then 4): a court of five plays five doubles games to 15 and each player sits out one.""")
f.write_text(s)
print("p30 applied")
