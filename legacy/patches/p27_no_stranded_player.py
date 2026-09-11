# p27 (September 11, 2026): a player is never stranded alone on an empty court.
# The bottom player of a court moved down whenever the court was not Court 6 — even into an empty court. With 6 players
# (Court 1: 4, Court 2: 2) round 2 had one player alone on Court 2 and one alone on Court 3, and neither could play;
# it happened every round whenever the turnout left the last occupied court with 2–3 players (e.g. 17–20 attending).
# Now a player moves down only if the court below has players: the last occupied court is the bottom court.
# Applied everywhere the rule is decided or shown: rotation (and its bottom-tie toss), End Session's final moves, the
# projected next round, the round tracker and the court tally.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""function courtCap(c){return c===NC?5:4;}""", """function courtCap(c){return c===NC?5:4;}
// A court's bottom player moves down only into a court that has players (the last occupied court is the bottom court).
function hasPlayersBelow(c){const a=S.current?.assignments||{};return c<NC&&(a[c+1]||[]).some(id=>S.players.some(p=>p.id===id));}""")
sub("""    if(c<NC){
      const bot=courtSorted[courtSorted.length-1];""", """    if(hasPlayersBelow(c)){
      const bot=courtSorted[courtSorted.length-1];""")
sub("""    sorted.forEach((id,i)=>{if(i===0&&c>1)mv[id]='up';else if(i===sorted.length-1&&c<NC)mv[id]='down';else mv[id]='stay';});""",
    """    sorted.forEach((id,i)=>{if(i===0&&c>1)mv[id]='up';else if(i===sorted.length-1&&hasPlayersBelow(c))mv[id]='down';else mv[id]='stay';});""")
sub("""    sorted.forEach((id,i)=>{if(i===0&&c>1)finalMv[id]='up';else if(i===sorted.length-1&&c<NC)finalMv[id]='down';else finalMv[id]='stay';});""",
    """    sorted.forEach((id,i)=>{if(i===0&&c>1)finalMv[id]='up';else if(i===sorted.length-1&&hasPlayersBelow(c))finalMv[id]='down';else finalMv[id]='stay';});""")
sub("""      else if(i===sorted.length-1&&c<NC)projectedMv[id]='down';""", """      else if(i===sorted.length-1&&hasPlayersBelow(c))projectedMv[id]='down';""")
sub("""${done&&loserP?`<div style="font-size:11px;">${c<NC?`""", """${done&&loserP?`<div style="font-size:11px;">${hasPlayersBelow(c)?`""")
sub("""        const mvDir=i===0&&c>1?'up':i===sorted.length-1&&c<NC?'down':'stay';""", """        const mvDir=i===0&&c>1?'up':i===sorted.length-1&&hasPlayersBelow(c)?'down':'stay';""")
sub("""  const hasBotTie=bottomTiedCount>1&&court<NC&&!allTied;""", """  const hasBotTie=bottomTiedCount>1&&hasPlayersBelow(court)&&!allTied;""")
sub("""        if(i===sorted.length-1&&court===NC&&!allTied)return""", """        if(i===sorted.length-1&&!hasPlayersBelow(court)&&!allTied)return""")
sub("""        if(court<NC&&isBotTied){""", """        if(hasPlayersBelow(court)&&isBotTied){""")
sub("""        if(i===sorted.length-1&&court<NC&&!allTied)return""", """        if(i===sorted.length-1&&hasPlayersBelow(court)&&!allTied)return""")
f.write_text(s)
print("p27 applied")
