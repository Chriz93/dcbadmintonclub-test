# p83 (September 19, 2026): the shared summary reports the night that was played.
#  From the organizer, pasting what Copy Summary produced: "I clicked copy summary, the data is wrong, please double
#  check, also check share to messenger". It was wrong three ways:
#   * every win was counted twice — it added the season total (which already holds tonight's rounds) to the current
#     round's wins, so Shivam read 9W although only six games were played all night (he won six);
#   * "3 Rounds Played" — it printed movements.length + 1, and two rounds had been played;
#   * "FINAL COURT STANDINGS" listed S.current.assignments, which after the last rotation are NEXT week's courts, so
#     it repeated the "next week" section and showed players under courts they never played that night.
#  "SEASON RANKINGS" was not a ranking either: it sorted by next week's court number.
#  Now: the night's wins come from the rounds themselves, the courts are the ones played in the last round, the season
#  list is sorted by the season's record, and next week's courts stay as they are. Share to Messenger sends the same
#  text, so it is fixed with it.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

start = s.index("function buildRoundSummary(){")
end = s.index("\n}\n", start) + 3
old_fn = s[start:end]
assert "FINAL COURT STANDINGS" in old_fn and "SEASON RANKINGS" in old_fn, "unexpected buildRoundSummary"
new_fn = """function buildRoundSummary(){
  if(!S.current)return'No active session';
  const cy=S.current.cycle,mv=S.current.movements||[];
  // p83: the rounds actually played, and the wins of those rounds — never the season total plus a round again.
  const rotated=mv.some(m=>m.cycle===cy);
  const status=computeRoundStatus();
  const nightWins={},nightGames={};
  mv.forEach(m=>{Object.entries(m.wins||{}).forEach(([id,w])=>{nightWins[id]=(nightWins[id]||0)+w;});});
  if(!rotated)Object.entries(status.wins||{}).forEach(([id,w])=>{if(w)nightWins[id]=(nightWins[id]||0)+w;});
  Object.entries(S.current.scores||{}).forEach(([k,sc])=>{[sc.a1,sc.a2,sc.b1,sc.b2].forEach(id=>{if(id!=null)nightGames[id]=(nightGames[id]||0)+1;});});
  const played=rotated?mv.length:mv.length+(status.totalScored>0?1:0);
  const rec=id=>`${nightWins[id]||0}W ${(nightGames[id]||0)-(nightWins[id]||0)}L`;
  let text=`🏸 DC Badminton Club\\nSession ${S.current.number} — ${S.current.date}\\n${played} ${played===1?'round':'rounds'} played${S.current.completed?' · session complete':rotated?'':` · round ${cy} under way`}\\n\\n`;
  // The courts as they were played in the last round — after the final rotation the session's courts are next week's.
  text+=`📊 COURTS AS PLAYED (Round ${cy}):\\n`;
  for(let c=1;c<=NC;c++){
    const pids=roundCourtPlayers(c,cy).map(id=>S.players.find(p=>p.id===id)).filter(Boolean);
    if(!pids.length)continue;
    const medal=c===1?'🥇':c===2?'🥈':c===3?'🥉':'';
    text+=`\\n${medal}Court ${c}:\\n`;
    [...pids].sort((a,b)=>(nightWins[b.id]||0)-(nightWins[a.id]||0)||a.name.localeCompare(b.name))
      .forEach((p,i)=>{text+=`  ${i+1}. ${p.name} — ${rec(p.id)}\\n`;});
  }
  // The season so far, by record — not by the court they will play next week.
  text+=`\\n🏆 SEASON SO FAR:\\n`;
  [...S.players].filter(p=>p.currentCourt>0||p.gamesPlayed>0)
    .sort((a,b)=>b.seasonWins-a.seasonWins||a.seasonLosses-b.seasonLosses||a.name.localeCompare(b.name))
    .forEach((p,i)=>{text+=`${i+1}. ${p.name} — ${p.seasonWins}W ${p.seasonLosses}L${p.currentCourt?` (next: C${p.currentCourt})`:''}\\n`;});
  text+=`\\n📋 NEXT WEEK COURTS:\\n`;
  for(let c=1;c<=NC;c++){
    const pids=(S.current.assignments[c]||[]).map(id=>S.players.find(p=>p.id===id)).filter(Boolean);
    if(!pids.length)continue;
    text+=`Court ${c}: ${pids.map(p=>p.name.split(' ')[0]).join(', ')}\\n`;
  }
  text+=`\\n🏸 See full stats: ${location.origin+location.pathname}`;
  return text;
}
"""
s = s[:start] + new_fn + s[end:]

# Share to Messenger sends the same text. On a phone the share sheet carries it; on a desktop browser the Messenger
# dialog can only carry a link, so the summary would be lost silently. Copy it first and say so.
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""function shareMessenger(){
  const text=buildRoundSummary();
  const encoded=encodeURIComponent(text);
  // Try native share first (mobile), fallback to Messenger deep link
  if(navigator.share){
    navigator.share({title:'DC Badminton Club',text}).catch(()=>{});
  }else{""",
    """function shareMessenger(){
  const text=buildRoundSummary();
  const encoded=encodeURIComponent(text);
  // Try native share first (mobile), fallback to Messenger deep link
  if(navigator.share){
    navigator.share({title:'DC Badminton Club',text}).catch(()=>{});
  }else{
    // p83: the Messenger dialog carries a link and nothing else, so put the summary on the clipboard and say so —
    // otherwise the dialog opens with the night's results silently dropped.
    try{navigator.clipboard?.writeText(text).then(()=>toast('Summary copied — paste it into the Messenger chat','success')).catch(()=>{});}catch(e){}""")

f.write_text(s)
print("p83 applied")
