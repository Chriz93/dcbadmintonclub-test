# p76 (September 17, 2026), from the organizer looking at the live site:
#  "the courts tab Arrow marks looks wrong" — the gym view drew the PREVIOUS round's moves. After Round 2 it still
#   showed Round 1's (Cindy ↑, Jagjot ↓) although Round 2 had moved Jagjot up into Court 1. It now draws the moves that
#   produced the courts on screen, and says where each came from ("↑C2").
#  "the allignment of order of courts has to be same everywhere … keep it court 6 at left bottom" — every six-court
#   grid now follows the gym: 1 2 3 on top, 6 5 4 below, so a court sits in the same place on every page.
#  "remove NET, Entrance side, Backwall etc" — those labels are gone.
#  "On rankings keep it arrow mark, dont do that stock graph, if the ELO has reduced, red arrow down and by how many
#   points … and if its gone up green and by how many" — the 📈/📉 guess (rating against the court it expected) is
#   replaced by the real change over the session being played, or the last one played: ▲ +12 in green, ▼ −9 in red.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# ── One order for every six-court grid: 1 2 3 on top, 6 5 4 below (the gym's own layout). ──
sub("""function computeRoundStatus(){""",
    """// p76: courts are shown in the gym's order everywhere — 1 2 3 across the top, 6 5 4 below, so Court 6 is always
// bottom left and a court keeps its place on every page.
const COURT_VIEW_ORDER=[1,2,3,6,5,4];
function computeRoundStatus(){""")
# Completed rounds, the courts card, the round's result card and the standings all follow it.
sub("""        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">`;
      for(let c=1;c<=NC;c++){
        // Find which players were on this court before rotation""",
    """        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;">`;
      for(const c of COURT_VIEW_ORDER){ // p76
        // Find which players were on this court before rotation""")
sub("""    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:6px;">`;
  for(let c=1;c<=NC;c++){
    const pids=(S.current.assignments[c]||[]).map(id=>S.players.find(p=>p.id===id)).filter(Boolean);""",
    """    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:6px;">`;
  for(const c of COURT_VIEW_ORDER){ // p76
    const pids=(S.current.assignments[c]||[]).map(id=>S.players.find(p=>p.id===id)).filter(Boolean);""")
sub("""  html+=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;">`;
  for(let c=1;c<=NC;c++){
    const cs=status.courts[c];""",
    """  html+=`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px;">`;
  for(const c of COURT_VIEW_ORDER){ // p76
    const cs=status.courts[c];""")

# ── The gym view: the walls and the net label go, and the arrows are the moves that made these courts. ──
sub("""        <div class="gym-wall">← Entrance Side →</div>\n""", "")
sub("""        <div class="gym-wall">← Back Wall →</div>\n""", "")
sub(""".gc-divider::after{content:'NET';""", """.gc-divider::after{content:'';""")
sub("""  const prevMv=S.current?.movements?.find(m=>m.cycle===cy-1)?.mv||{};""",
    """  // p76: the moves that produced the courts now on screen — the last round's once the night is finished, the
  // previous round's while one is being played (it drew the previous round's moves in both cases before).
  const prevMv=S.current?.movements?.find(m=>m.cycle===(S.current.completed?cy:cy-1))?.mv||{};
  const prevMvCycle=S.current?.completed?cy:cy-1;""")

# ── Rankings: the real change in Elo, not a guess. ──
# computeEloRatings() may now be asked for the ratings of a given list of sessions, so the change over the session
# being played (or the last one played) is the difference between "every session" and "every session but that one".
sub("""function computeEloRatings(){""", """function computeEloRatings(sessList){""")
sub("""  const seasonSess=[...(S.sessions||[])].filter(Boolean);if(S.current)seasonSess.push(S.current);""",
    """  const seasonSess=(sessList?[...sessList]:[...(S.sessions||[]),...(S.current?[S.current]:[])]).filter(Boolean); // p76""")
sub("""  // Every completed session, then the live one, round by round in order. Ratings are frozen within a round.
  const allSess=[...(S.sessions||[])].filter(Boolean);
  if(S.current)allSess.push(S.current);""",
    """  // Every completed session, then the live one, round by round in order. Ratings are frozen within a round.
  const allSess=seasonSess; // p76""")
sub("""function renderRankings(){""",
    """// p76: how much each player's Elo moved over the session being played, or the last one played (0 before any).
function eloChangeThisSession(){
  const sess=[...(S.sessions||[]),...(S.current?[S.current]:[])].filter(Boolean);
  if(!sess.length)return{};
  const now=computeEloRatings(sess),before=computeEloRatings(sess.slice(0,-1));
  const out={};Object.keys(now).forEach(id=>{out[id]=Math.round(now[id]-(before[id]??now[id]));});
  return out;
}
function renderRankings(){""")
sub("""  const elo=computeEloRatings();""", """  const elo=computeEloRatings(),eloMoved=eloChangeThisSession(); // p76""")
sub("""    const trend=p.rating>=1500-(p.courtPos-1)*100+50?'📈':p.rating<=1500-(p.courtPos-1)*100-50?'📉':'';""",
    """    // p76: the arrow says what the Elo did this session and by how much, instead of guessing from the court.
    const moved=eloMoved[p.id]||0;
    const trend=moved>0?`<span style="color:var(--green2);font-weight:800;">▲ +${moved}</span>`
      :moved<0?`<span style="color:var(--red2);font-weight:800;">▼ ${moved}</span>`:'';""")
# The change belongs beside the rating, not inside the player's name (a name must stay a name).
sub("""${absentTag}${trend?' <span style="font-size:12px;">'+trend+'</span>':''}</div>""", """${absentTag}</div>""")
sub("""        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">ELO</div>""",
    """        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;">ELO</div>
        ${trend?`<div style="font-size:11px;font-weight:800;white-space:nowrap;">${trend}</div>`:''}""")

f.write_text(s)
print("p76 applied (order, labels, gym arrows, Elo change)")
