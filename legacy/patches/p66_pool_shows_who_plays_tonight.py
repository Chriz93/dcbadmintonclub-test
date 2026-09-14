# p66 (September 13, 2026): the Spare Pool shows who Call In has seated tonight.
#  Found on TEST by the organizer ("I tried calling in 2 players, nothing happening") and confirmed on the live page:
#  during Round 1 both Call Ins had worked (the players were marked present and seated on Court 6), but the Spare Pool
#  on Admin → Players and Admin → Attendance lists players by their earned ladder court (still none), so both stayed
#  in the pool with the same Call In button and nothing on the screen changed.
#  - During a session a pool player already seated tonight shows "✓ Playing · Court N" instead of Call In.
#  - Found by the tests for it: on a smaller night Call In for a player without a court was refused ("would be alone on
#    Court 6 and no court nearby has room") because it aimed at Court 6, which was not in use. A player is now called
#    in to their earned court when it is in use tonight (or above the bottom court in use), otherwise to the bottom
#    court in use tonight, as p61 does before a session.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub(''' return `<button class="btn btn-success btn-sm" style="padding:3px 6px;font-size:11px;margin:0;" aria-label="Call in ${esc(p.name)}"${courtLock()} onclick="callInSpare(${p.id})">📲 Call In</button>`;''',
    ''' // p66: during a session a player Call In has already seated tonight shows their court instead of Call In.
 if(S.current){const tc=courtOfPlayer(p.id);if(tc)return `<span class="tag tg-green" title="${esc(p.name)} is playing tonight on Court ${tc}">✓ Playing · Court ${tc}</span>`;}
 return `<button class="btn btn-success btn-sm" style="padding:3px 6px;font-size:11px;margin:0;" aria-label="Call in ${esc(p.name)}"${courtLock()} onclick="callInSpare(${p.id})">📲 Call In</button>`;''')

sub("async function changePlayerAttendance(id,status){",
    "// p66: the court a player without a seat tonight is called in to: their earned court when it is in use tonight (or\n"
    "// above the bottom court in use), otherwise the bottom court in use tonight.\n"
    "function callInCourt(c){const a=S.current?.assignments||{},used=[];for(let x=1;x<=NC;x++)if((a[x]||[]).length)used.push(x);if(!used.length)return c||NC;const b=Math.max(...used);return c&&(used.includes(c)||c<b)?c:b;}\n"
    "async function changePlayerAttendance(id,status){")
sub(" const from=courtOfPlayer(id)||p.currentCourt||NC;", " const from=courtOfPlayer(id)||callInCourt(p.currentCourt);")

f.write_text(s)
print("p66 applied")
