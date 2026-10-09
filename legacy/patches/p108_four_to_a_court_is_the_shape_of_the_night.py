# p108 (October 9, 2026): four to a court is the shape of the night. The fifth seat is a pressure valve, not a target.
#  From the organizer, reading the p107 settle: "even if its 5 and we decided to play only with 4 per court, the lowest
#  should go down."
#  THE DEFECT. Two parts of the app disagreed about what a full court is. courtSizes() has always aimed at FOUR to a
#  court, adding a fifth only once more than NC*4 players are coming. The pre-session settle (p105, p107) tested
#  `L[c].length>5` — the hard ceiling of the court-adjustment engine — so a court sitting at exactly five was never
#  settled and kept a bottom player it should have sent down. On the league's own data (production backup, 4 October)
#  Courts 1, 3, 4 and 5 each sit at exactly five: four courts whose bottom player should move and did not.
#  THE RULE, as the organizer decided it: settle every court down to FOUR wherever the night allows, and when more than
#  NC*4 say yes let the LOWEST courts take a fifth rather than turn anybody away. Nobody sits out; a regular who said
#  yes always has a seat. This is exactly courtSizes()'s own arithmetic, so the two now agree instead of contradicting.
#  WHAT IS NOT TOUCHED:
#    * the ROTATION at the end of a night (play and lose, drop a court, no floor) — untouched since p107 said so.
#    * adjustCourts' MAX=5 — the hard ceiling that absorbs an overflow and keeps nobody playing alone. It stays five,
#      which is what lets the fifth seat exist at all when the night is full.
#    * the seats the organizer placed by hand. A pinned player is still never moved by the machine.
#    * one court per player per evening (p107's `arrived` set) still caps the settle.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# The cap, stated once, next to the sizing function it now agrees with.
sub("""function fillCourts(ids){""",
    """// p108: what a full court is TONIGHT. This is NOT courtCap() above: that is the hard ceiling the end-of-night
// rotation and adjustCourts enforce, and it stays five. Four to a court is the shape of the night; the fifth seat
// opens only when more than four times the courts IN USE are coming, and it opens on the lowest of those courts first
// — courtSizes()' own arithmetic, but counted over the courts tonight actually uses. Counting it over all six would
// promise seats on courts nobody earned, and the settling would push players down only for the engine to fetch them
// straight back up.
function nightCaps(total,used){const cap={};for(let c=1;c<=NC;c++)cap[c]=0;
  const u=(used&&used.length?[...used]:[...Array(NC).keys()].map(i=>i+1)).sort((a,b)=>a-b),n=u.length;
  const extra=Math.max(0,Math.min(total-n*4,n));                       // the fifth seats owed tonight
  u.forEach((c,i)=>{cap[c]=4+(i>=n-extra?1:0);});                      // owed to the LOWEST courts in use first
  return cap;}
function fillCourts(ids){""")

sub("""   // p105, p107: a court of more than five sends a player to the next court in use below and places them there by the
   // same measure, and that court settles the same way — "where he fits in with the points" — instead of dropping them
   // at the bottom of whichever court took them. The player sent down is the bottom one who has NOT already been moved
   // this evening, so nobody falls more than a single court in one night. Losing a night's play still costs a court at
   // the end of the night, every night, with no floor: that is the rotation, and it is untouched.
   const arrived=new Set();
   for(let c=1;c<NC;c++){
     while(L[c].length>5){""",
    """   // p105, p107, p108: a court holding more than tonight's share sends a player to the next court in use below and
   // places them there by the same measure, and that court settles the same way — "where he fits in with the points" —
   // instead of dropping them at the bottom of whichever court took them. The player sent down is the bottom one who
   // has NOT already been moved this evening, so nobody falls more than a single court in one night. Losing a night's
   // play still costs a court at the end of the night, every night, with no floor: that is the rotation, untouched.
   const used=[];for(let c=1;c<=NC;c++)if(L[c].length)used.push(c);
   const arrived=new Set(),cap=nightCaps(used.reduce((n,c)=>n+L[c].length,0),used);
   for(let c=1;c<NC;c++){
     while(L[c].length>cap[c]){""")

sub("""       notes.push(`Court ${c} would have more than five players, so ${nm(moved)} starts on Court ${to}.`);""",
    """       notes.push(`Court ${c} would have more than ${cap[c]===4?'four':'five'} players, so ${nm(moved)} starts on Court ${to}.`);""")

f.write_text(s)
print("p108 applied")
