# p34 (September 11, 2026): Admin → 📇 Past Players. The 2026-27 season starts with an empty player list; everyone from
# earlier seasons is kept, organizer only, in past_players (migrations L17 and R02) with all their details.
#  - New Admin tab listing every past player (name, membership, email, phone, emergency contact, medical note, last
#    court and record), with a search box.
#  - "✉️ Invite back" sends the usual invitation (their membership, a note saying they are returning); the row then
#    shows "invited". A past player who already registered this season shows "registered"; one without an email shows
#    "no email" (invite them from Registered with their current address).
#  - The invitation card no longer says returning players just sign in: this season everyone needs an invitation.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""      <button class="ptab" onclick="showSec('admin','a-sess',this)">📅 Session</button>""",
    """      <button class="ptab" onclick="showSec('admin','a-past',this)">📇 Past Players</button>
      <button class="ptab" onclick="showSec('admin','a-sess',this)">📅 Session</button>""")
sub("""    <div id="sec-a-reg" class="section"></div>""",
    """    <div id="sec-a-reg" class="section"></div>
    <div id="sec-a-past" class="section"></div>""")
sub("""    S.invitations=(S_me.organizer&&S_me.verified)?((await sbG('invitations','select=email,membership_type,note,created_at&order=created_at.desc'))||[]):[];""",
    """    S.invitations=(S_me.organizer&&S_me.verified)?((await sbG('invitations','select=email,membership_type,note,created_at&order=created_at.desc'))||[]):[];
    S.pastPlayers=(S_me.organizer&&S_me.verified)?((await sbG('past_players','select=*&order=name.asc'))||[]):[];""")
sub("renderAdminPlayers();renderRegPlayers();", "renderAdminPlayers();renderRegPlayers();renderPastPlayers();")
sub("""  await loadAll();renderAll();toast('Invitation withdrawn','warn');
}
""", """  await loadAll();renderAll();toast('Invitation withdrawn','warn');
}
// Admin → Past Players: everyone from earlier seasons, organizer only (past_players). "Invite back" sends the usual invitation.
function renderPastPlayers(typing){
  const el=document.getElementById('sec-a-past');if(!el)return;
  const all=S.pastPlayers||[],q=(g('past-q')||'').trim().toLowerCase();
  const invited=new Set((S.invitations||[]).map(i=>i.email)),current=new Set(S.players.map(p=>(p.email||'').toLowerCase()).filter(Boolean));
  const list=all.filter(p=>!q||[p.name,p.email,p.phone].some(v=>String(v||'').toLowerCase().includes(q)));
  el.innerHTML=`<div class="card"><div class="card-title">📇 Past Players (${all.length})</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Everyone on file before the 2026–27 fresh start, with their details. Only you can see this list. “Invite back” sends the usual invitation: they sign in with that email, register, and you approve them.</div>
    <input class="inp" id="past-q" placeholder="Search name, email or phone" autocomplete="off" value="${esc(q)}" oninput="renderPastPlayers(true)">
    ${list.length?list.map(p=>{const em=String(p.email||'').trim().toLowerCase();
      const state=!em?'<span class="tag tg-gray">no email</span>':current.has(em)?'<span class="tag tg-green">registered</span>':invited.has(em)?'<span class="tag tg-teal">invited</span>':`<button class="btn btn-primary btn-sm" style="margin:0;" onclick="invitePastPlayer(${Number(p.id)})">✉️ Invite back</button>`;
      return `<div class="past-row" style="padding:10px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <div class="flex-between"><div><strong>${esc(p.name)}</strong> <span class="tag ${p.membership_type==='spare'?'tg-yellow':'tg-teal'}">${esc(p.membership_type||'regular')}</span></div>${state}</div>
        <div class="past-contact" style="color:var(--muted);margin-top:4px;">${[p.email?'📧 '+esc(p.email):'',p.phone?'📞 '+esc(p.phone):'',p.emergency?'🆘 '+esc(p.emergency):''].filter(Boolean).join(' · ')}</div>
        ${p.medical?`<div style="color:var(--muted);">🩺 ${esc(p.medical)}</div>`:''}
        <div class="past-record" style="color:var(--muted);">${esc(p.season_label||'')} · last court ${p.current_court||'—'} · ${p.season_wins||0}W ${p.season_losses||0}L in ${p.games_played||0} games</div>
      </div>`;}).join(''):`<div style="font-size:12px;color:var(--muted);margin-top:8px;">${all.length?'No past player matches.':'No past players.'}</div>`}
  </div>`;
  if(typing){const i=document.getElementById('past-q');if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length);}}
}
async function invitePastPlayer(id){
  const p=(S.pastPlayers||[]).find(x=>Number(x.id)===Number(id));if(!p)return;
  const email=String(p.email||'').trim().toLowerCase(),membership_type=p.membership_type==='spare'?'spare':'regular';
  if(!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email))return toast('No valid email on file — invite them from Registered with their current address','warn');
  const r=await sbP('invitations',{email,membership_type,note:`Returning player (${p.season_label||'earlier season'})`});
  if(r&&r.code)return toast('Invitation not saved: '+(r.message||r.code),'error');
  await loadAll();renderAll();toast(`Invited ${p.name} back as ${membership_type}. They sign in with ${email} and register.`,'success');
}
""")
sub("""Returning players just sign in with the email on their record. New players need an invitation: they sign in with this email, register, and you approve them.""",
    """Everyone needs an invitation this season: invite returning players from 📇 Past Players, new players here. They sign in with that email, register, and you approve them.""")
f.write_text(s)
print("p34 applied")
