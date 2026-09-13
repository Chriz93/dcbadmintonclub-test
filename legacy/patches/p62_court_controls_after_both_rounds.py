# p62 (September 13, 2026): once both rounds are finished, controls that would change tonight's courts are not offered.
#  - Found by the button census: with both rounds finished (before End Session), the Assign tab's "Move" selectors and
#    the "Court for" selectors on Admin → Players and Registered (two kinds) were offered, but choosing a court only answered
#    "Start an unfinished session first"; Call In in the pool no longer made sense either.
#  - Now they are shown disabled, with the reason in their title: end the session to save the final courts, then change
#    courts. The functions keep their own refusals as a backstop.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("// p61: the pool's action for a player: a spare who is already coming for the next session shows their status instead.",
    """// p62: once both rounds are finished, controls that would change tonight's courts are shown disabled, with the reason.
function courtLock(){return S.current&&S.current.completed?' disabled title="Both rounds are finished. End the session to save the final courts, then change courts."':'';}
// p61: the pool's action for a player: a spare who is already coming for the next session shows their status instead.""")
sub('''<select aria-label="Court for ${esc(p.name)}" style="background:var(--s3);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:3px 4px;font-size:10px;" onchange="setPlayerCourt(${p.id},this.value)">''',
    '''<select aria-label="Court for ${esc(p.name)}"${courtLock()} style="background:var(--s3);border:1px solid var(--border);border-radius:6px;color:var(--text);padding:3px 4px;font-size:10px;" onchange="setPlayerCourt(${p.id},this.value)">''', 2)
sub('''<select class="inp" aria-label="Move ${esc(p.name)}" onchange="moveCourtPlayer(${p.id},Number(this.value))">''',
    '''<select class="inp" aria-label="Move ${esc(p.name)}"${courtLock()} onchange="moveCourtPlayer(${p.id},Number(this.value))">''', 2)
sub('''<select class="inp" aria-label="Court for ${esc(p.name)}" style="font-size:10px;padding:4px 6px;margin:0;" onchange="assignCourtToRegistered(${p.id},this.value)">''',
    '''<select class="inp" aria-label="Court for ${esc(p.name)}"${courtLock()} style="font-size:10px;padding:4px 6px;margin:0;" onchange="assignCourtToRegistered(${p.id},this.value)">''')
sub('''aria-label="Call in ${esc(p.name)}" onclick="callInSpare(${p.id})">📲 Call In</button>`;''',
    '''aria-label="Call in ${esc(p.name)}"${courtLock()} onclick="callInSpare(${p.id})">📲 Call In</button>`;''')
f.write_text(s)
print("p62 applied")
