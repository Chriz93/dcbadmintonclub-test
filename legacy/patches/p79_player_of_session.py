# p79 (September 18, 2026), from the organizer:
#  "yes break the tie by win rate then court" — two players on the same weighted score were separated by whichever the
#   sort happened to put first. Now: the higher win rate wins it, and if that is level too, the higher court (Court 1
#   beats Court 5). Only if all three are equal does the lower player id decide, so the banner never flickers between
#   two people on a redraw.
#  "the 6W are on court 5 and then on court 4 right? shouldnt we mention like that?" — yes. The banner said "on Court 5"
#   (where they started). It now names every court they played that night: "on Courts 5 → 4".
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""  const best=Object.entries(weighted).sort((a,b)=>b[1]-a[1])[0];""",
    """  // p79: level on the weighted score? the better win rate takes it, then the higher court, then the lower id so the
  // banner is the same on every redraw.
  const rate=id=>(playerWins[id]||0)/(playerGames[id]||1);
  const best=Object.entries(weighted).sort((a,b)=>b[1]-a[1]||rate(b[0])-rate(a[0])||(playerCourt[a[0]]||NC)-(playerCourt[b[0]]||NC)||a[0]-b[0])[0];""")
sub("""  const court=playerCourt[pid]||'?';
  el.innerHTML=`<div class="pos-banner"><div class="pos-crown">👑</div><div class="pos-title">Player of Session ${sess.number}</div><div class="pos-name">${esc(p.name)}</div><div class="pos-stat">${wins}W ${games-wins}L on Court ${court} · Session ${sess.number} — ${sess.date}</div></div>`;""",
    """  // p79: the courts they actually played that night, in round order — "Courts 5 → 4" when they moved.
  const played=[];
  for(let cy=1;cy<=MAX_ROUNDS_PER_SESSION;cy++)for(let c=1;c<=NC;c++){
    const on=Object.entries(sess.scores||{}).some(([k,sc])=>k.startsWith(`c${c}_y${cy}_`)&&[sc.a1,sc.a2,sc.b1,sc.b2].includes(pid));
    if(on&&played[played.length-1]!==c)played.push(c);
  }
  const court=playerCourt[pid]||'?';
  const courtLine=played.length>1?`Courts ${played.join(' → ')}`:`Court ${played[0]||court}`;
  el.innerHTML=`<div class="pos-banner"><div class="pos-crown">👑</div><div class="pos-title">Player of Session ${sess.number}</div><div class="pos-name">${esc(p.name)}</div><div class="pos-stat">${wins}W ${games-wins}L on ${courtLine} · Session ${sess.number} — ${sess.date}</div></div>`;""")

f.write_text(s)
print("p79 applied")
