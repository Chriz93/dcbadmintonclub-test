# p40 (September 12, 2026): after the organizer changes a move in the Adjust courts preview, the lines that describe
# each changed court ("Court 3 now has 5 players: …", "Nobody is left to play this round.") are worked out again from
# the courts as changed, instead of repeating the ones from the original proposal.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""  const kept=moves.filter(m=>m.from!==m.to);let changed=false;for(let c=1;c<=NC;c++)if(!adjSame(L[c],before[c]))changed=true;
  return {...res,lineup:L,moves:kept,changed};""", """  const kept=moves.filter(m=>m.from!==m.to);let changed=false;for(let c=1;c<=NC;c++)if(!adjSame(L[c],before[c]))changed=true;
  const notes=res.notes.filter(x=>!/^Court \\d now has \\d players: /.test(x)&&x!=='Nobody is left to play this round.');
  for(let c=1;c<=NC;c++)if(L[c].length!==before[c].length&&L[c].length>=2)notes.push(`Court ${c} now has ${L[c].length} players: ${adjFormat(L[c].length)}.`);
  if(!Object.values(L).flat().length)notes.push('Nobody is left to play this round.');
  return {...res,lineup:L,moves:kept,changed,notes};""")
f.write_text(s)
print("p40 applied")
