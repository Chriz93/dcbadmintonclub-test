# p75 (September 17, 2026): the crown belongs to the top court, the solid marker to the bottom one, and every result
#  shows the points as well as the wins. From the organizer, on p74's markers: "court 1 for crown and court 6 for this
#  solid down arrow, also the total score along side wins is required".
#  So: 👑 marks only Court 1's best player (the night's top of the ladder) and 🔻 only Court 6's last (the bottom of
#  it); every other court shows its plain move, "C3 → C2 ↑" in green or "C3 → C4 ↓" in red. Wherever a round's wins
#  are shown, the points won are shown beside them ("2W · 61 pts"), because two players often finish on the same wins.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# 1. Completed Rounds: points beside the wins, the crown on Court 1's best and the solid marker on Court 6's last.
sub("""          const w=mWins[pid]||0;
          const mvIcon=dir==='up'&&c>1?'<span style="color:var(--green2);font-weight:800;"> ↑</span>':dir==='down'&&c<NC?'<span style="color:var(--red2);font-weight:800;"> ↓</span>':'';
          html+=`<div style="font-size:11px;padding:1px 0;display:flex;justify-content:space-between;align-items:center;">
            <span>${esc(p.name.split(' ')[0])}${mvIcon}</span>
            <span style="color:var(--teal2);font-weight:700;">${w}W</span>
          </div>`;""",
    """          const w=mWins[pid]||0,ptsWon=mPts[pid]||0;
          const ends=roundStatusFor(mCy,c); // p75: the crown is Court 1's, the solid marker Court 6's
          const badge=c===1&&ends.top===pid?'👑 ':c===NC&&ends.bottom===pid?'🔻 ':'';
          const mvIcon=dir==='up'&&c>1?`<span style="color:var(--green2);font-weight:800;"> C${c} → C${c-1} ↑</span>`:dir==='down'&&c<NC?`<span style="color:var(--red2);font-weight:800;"> C${c} → C${c+1} ↓</span>`:'';
          html+=`<div style="font-size:11px;padding:1px 0;display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span>${badge}${esc(p.name.split(' ')[0])}${mvIcon}</span>
            <span style="color:var(--teal2);font-weight:700;white-space:nowrap;">${w}W · ${ptsWon} pts</span>
          </div>`;""")

# 2. The next session's courts: the crown only for the player who topped Court 1, the solid marker only for Court 6's last.
sub("""        const mark=lastMv&&roundStatusFor(lastMv.cycle,from).top===p.id?' 👑':lastMv&&roundStatusFor(lastMv.cycle,from).bottom===p.id?' 🔻':'';""",
    """        const ends=lastMv?roundStatusFor(lastMv.cycle,from):{top:null,bottom:null}; // p75
        const mark=from===1&&ends.top===p.id?' 👑':from===NC&&ends.bottom===p.id?' 🔻':'';""")

# 3. The round's result card: Court 1's best is crowned, Court 6's last carries the solid marker, everyone else moves;
#    each line carries the wins and the points won.
sub("""      ${done&&winnerP?`<div style="font-size:11px;margin-top:3px;"><span style="color:${c>1?'var(--green2)':'var(--muted)'};">👑${esc(winnerP.name.split(' ')[0])}${c>1?` C${c} → C${c-1} ↑`:' stays on the top court'}</span></div>`:''}
      ${done&&loserP?`<div style="font-size:11px;"><span style="color:${hasPlayersBelow(c)?'var(--red2)':'var(--muted)'};">🔻${esc(loserP.name.split(' ')[0])}${hasPlayersBelow(c)?` C${c} → C${c+1} ↓`:' stays on the bottom court'}</span></div>`:''}""",
    """      ${done&&winnerP?`<div style="font-size:11px;margin-top:3px;"><span style="color:${c>1?'var(--green2)':'var(--muted)'};">${c===1?'👑':'↑'}${esc(winnerP.name.split(' ')[0])} ${status.wins[winnerP.id]||0}W · ${status.pts[winnerP.id]||0} pts${c>1?` · C${c} → C${c-1}`:' · tops the ladder'}</span></div>`:''}
      ${done&&loserP?`<div style="font-size:11px;"><span style="color:${hasPlayersBelow(c)?'var(--red2)':'var(--muted)'};">${hasPlayersBelow(c)?'↓':'🔻'}${esc(loserP.name.split(' ')[0])} ${status.wins[loserP.id]||0}W · ${status.pts[loserP.id]||0} pts${hasPlayersBelow(c)?` · C${c} → C${c+1}`:' · bottom of the ladder'}</span></div>`:''}""")

f.write_text(s)
print("p75 applied")
