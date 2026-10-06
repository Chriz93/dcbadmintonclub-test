# p104 (October 6, 2026): the organizer sets how many regular places the season has, and moves a member between regular
#  and spare in one click.
#  From the organizer: "Lets keep 28 regulars as every session am looking for spares to fill in … ultimately admin
#  decides whether to run with 27 regualrs or 28 regulars or 29 regulars and so on, but we cap at 30, thats the max",
#  and "Admin → Players → rahul tamrakar — I should be able Make him a spare … keep waiver and all 12 games. That frees a
#  place, so the cap is no longer in the way."
#  What was wrong: neither existed. The number of regular places could only be changed by starting a new season, which
#  archives everything (p101 could add one place at a time as a side effect of going over, which is not the same as
#  saying "this season runs with 28"). And toggleMembership had been in the page since the beginning with nothing
#  anywhere that called it — there was no control at all to move somebody between regular and spare.
#  Now: Admin → 📋 Registered carries the season's regular places (2 to 30, the range the database allows, never below
#  the regulars already approved), and every member — in Registered and in Admin → 👤 Players — carries a one-click
#  change between Regular and Spare. Making somebody a spare says plainly what it keeps: their waiver, their payment
#  record and every game they have played; it frees their regular place, which is the point.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# ── The season's regular places ───────────────────────────────────────────────────────────────────────────────────────
sub("""  // Not registered — admin-added without waiver
  if(notRegistered.length){""",
    """  // p104: the number of regular places is the organizer's, not something only a new season can change (L29).
  html+=`<div class="card" id="season-places"><div class="card-title">🎟️ Regular places this season</div>
    <div style="font-size:12px;color:var(--muted);margin-bottom:8px;line-height:1.5;"><strong style="color:var(--text);">${regularCount} of ${REGULAR_CAPACITY} taken.</strong> This is the number the registration form stops at: a player who registers when the places are full goes on the waitlist. Raise it to run the season with more regulars — up to ${PLACES_MAX} — or lower it to close the season off. It cannot go below the regulars already approved.</div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
      <div style="flex:1 1 120px;min-width:0;"><label class="lbl" for="rc-places">Places</label><input class="inp" id="rc-places" type="number" inputmode="numeric" min="2" max="${PLACES_MAX}" step="1" value="${REGULAR_CAPACITY}"></div>
      <button class="btn btn-primary btn-sm" id="rc-save" onclick="saveRegularPlaces()">Save</button>
    </div></div>`;
  // Not registered — admin-added without waiver
  if(notRegistered.length){""")

sub("""async function promoteFromWaitlist(id){""",
    """// p104: the season's regular places. The database allows 2 to 30 and refuses anything below the regulars already
// approved (L29), so the only thing to do here is ask for a number and say what came back.
const PLACES_MAX=30;
async function saveRegularPlaces(){
  if(!adminUnlocked)return toast('Organizer verification required','warn');
  const want=parseInt(document.getElementById('rc-places')?.value||'');
  if(!Number.isInteger(want)||want<2||want>PLACES_MAX)return toast(`Regular places must be a number from 2 to ${PLACES_MAX}`,'warn');
  if(want===REGULAR_CAPACITY)return toast(`The season already has ${want} regular places`,'info');
  try{await rpc('set_regular_capacity',{p_capacity:want});}
  catch(e){return toast('Places not changed: '+e.message,'error');}
  REGULAR_CAPACITY=want;
  await loadAll();renderAll();
  toast(`The season now has ${want} regular places`,'success');
}
// p104: one click between Regular and Spare. Going to spare frees a regular place and costs the player nothing they
// have earned; going to regular asks the over-cap question when the places are full (p101).
async function setMembership(id,type){
  const p=S.players.find(x=>x.id===id);if(!p)return;
  if(type===p.membershipType)return toast(`${p.name} is already a ${type==='spare'?'spare':'regular member'}`,'info');
  if(type==='spare'&&!confirm(`Make ${p.name} a spare?\\n\\nThey keep their waiver, their payment record and every game they have played. Their regular place is freed, and they play when you call them in.`))return;
  return toggleMembership(id,type);
}
function membershipBtn(p,compact){
  const spare=p.membershipType==='spare',to=spare?'regular':'spare';
  const title=spare?`Make ${esc(p.name)} a regular member`:`Make ${esc(p.name)} a spare — frees their regular place, keeps their waiver, payments and games`;
  return compact
    ? `<span class="tag ${spare?'tg-yellow':'tg-teal'} member-type" data-pid="${p.id}" style="cursor:pointer;font-size:11px;" title="${title}" onclick="setMembership(${p.id},'${to}')">${spare?'Spare':'Regular'}</span>`
    : `<button class="btn btn-ghost btn-sm member-type" data-pid="${p.id}" style="padding:4px 8px;" title="${title}" onclick="setMembership(${p.id},'${to}')">${spare?'→ Regular':'→ Spare'}</button>`;
}
async function promoteFromWaitlist(id){""")

# A failed save must not say it worked.
sub("""  const overrides=await getKV('membership_overrides')||{};
  overrides[id]=type;
  await setKV('membership_overrides',overrides);""",
    """  const overrides=await getKV('membership_overrides')||{};
  overrides[id]=type;
  try{await setKV('membership_overrides',overrides);} // p104: say so when it does not save
  catch(e){await loadAll();renderAll();return toast('Membership not changed: '+e.message,'error');}""")

# ── The control, on both screens ──────────────────────────────────────────────────────────────────────────────────────
sub("""        <button class="btn btn-ghost btn-sm" onclick="editRegistration(${p.id})" style="padding:4px 8px;">✏️ Edit</button>""",
    """        ${membershipBtn(p)}
        <button class="btn btn-ghost btn-sm" onclick="editRegistration(${p.id})" style="padding:4px 8px;">✏️ Edit</button>""")

# p94 again: one more control in that row is one too many for a 320-pixel phone, so the row wraps.
sub("""      <div style="font-weight:800;font-size:13px;">${esc(p.name)}${isSpare?'<span class="spare-badge">SPARE</span>':''}</div>
      <div style="display:flex;gap:5px;">""",
    """      <div style="font-weight:800;font-size:13px;">${esc(p.name)}${isSpare?'<span class="spare-badge">SPARE</span>':''}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;">""")

sub("""    <button class="notes-btn" onclick="openAdminNote(${p.id})" aria-label="${p.adminNote?'Private note':'Add a private note'} for ${esc(p.name)}" title="${p.adminNote?'Private note':'Add a private note'} for ${esc(p.name)}">${noteIcon}</button>""",
    """    <button class="notes-btn" onclick="openAdminNote(${p.id})" aria-label="${p.adminNote?'Private note':'Add a private note'} for ${esc(p.name)}" title="${p.adminNote?'Private note':'Add a private note'} for ${esc(p.name)}">${noteIcon}</button>
    ${membershipBtn(p,true)}""")

sub(""""promoteFromWaitlist":"Promote from waitlist","saveEditRegistration":"Edit registration","saveDropIn":"Starting points","clearDropIn":"Starting points"};""",
    """"promoteFromWaitlist":"Promote from waitlist","saveEditRegistration":"Edit registration","saveDropIn":"Starting points","clearDropIn":"Starting points","setMembership":"Change membership","saveRegularPlaces":"Regular places"};""")

f.write_text(s)
print("p104 applied")
