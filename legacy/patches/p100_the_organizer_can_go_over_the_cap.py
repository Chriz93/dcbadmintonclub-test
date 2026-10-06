# p100 (October 5, 2026): the organizer can take a player off the waitlist when the season is already full.
#  From the organizer: "admin should be able to approve the waitlist and make a player regular, even if the cap is
#  reached".
#  What was wrong: the cap (26 regular places this season) was enforced against the organizer as well as against the
#  registration form. With 26 places taken, Promote was not even drawn — the waitlist showed "Slots Full" and there was
#  no way through it. So when a regular withdrew mid-season and the organizer wanted the next player in line in their
#  place, the app said no: the withdrawing player still held their place until they were archived, and until then the
#  count was full. The cap exists to stop the registration form overfilling the season, which it still does; it was never
#  meant to overrule the person running the league.
#  Now Promote is always there. When the places are full it says so plainly — how many regulars there would be and that
#  it is over the cap — and asks the organizer to confirm, which is exactly the decision they said is theirs. Switching a
#  spare to regular asks the same way. The registration form is untouched: a player who registers into a full season
#  still goes on the waitlist.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

# One sentence, used by all three places, so the organizer reads the same words wherever they do this.
sub("""async function promoteWaitlisted(id){
  const p=S.players.find(x=>x.id===id);if(!p)return;
  const regularCount=S.players.filter(x=>x.membershipType!=='spare'&&!x.waitlisted&&x.approved&&x.id!==id).length;
  if(regularCount>=REGULAR_CAPACITY)return toast('No regular place is free','warn');""",
    """// p100: the cap stops the registration form overfilling the season; it does not stop the organizer. Over the cap the
// organizer is told what they are about to make true and asked to confirm it.
function overCapOk(name,taken){
  if(taken<REGULAR_CAPACITY)return true;
  return confirm(`All ${REGULAR_CAPACITY} regular places are taken. Making ${name} a regular puts the season at ${taken+1} regulars, over the cap of ${REGULAR_CAPACITY}.\\n\\nThis is your call — go ahead?`);
}
async function promoteWaitlisted(id){
  const p=S.players.find(x=>x.id===id);if(!p)return;
  const regularCount=S.players.filter(x=>x.membershipType!=='spare'&&!x.waitlisted&&x.approved&&x.id!==id).length;
  if(!overCapOk(p.name,regularCount))return; // p100""")

sub("""  if(regularPlacesTaken(id)>=REGULAR_CAPACITY){toast(`Still no open regular slots (${REGULAR_CAPACITY}/${REGULAR_CAPACITY})`,'warn');return;}
  if(!confirm(`Promote ${p.name} off the waitlist to Regular member?`))return;""",
    """  const taken=regularPlacesTaken(id); // p100
  if(taken>=REGULAR_CAPACITY){if(!overCapOk(p.name,taken))return;}
  else if(!confirm(`Promote ${p.name} off the waitlist to Regular member?`))return;""")

sub("""    const regularCount=S.players.filter(x=>x.membershipType==='regular'&&!x.waitlisted&&x.sig&&x.sig!=='admin'&&x.id!==id).length;
    if(regularCount>=REGULAR_CAPACITY){toast(`Regular slots full (${REGULAR_CAPACITY}/${REGULAR_CAPACITY}). Cannot switch to Regular.`,'warn');return;}""",
    """    const regularCount=S.players.filter(x=>x.membershipType==='regular'&&!x.waitlisted&&x.sig&&x.sig!=='admin'&&x.id!==id).length;
    if(!overCapOk(p.name,regularCount))return; // p100""")

# The button is always there; the count beside it says how full the season is.
sub("""          ${regularCount<REGULAR_CAPACITY?`<button class="btn btn-success btn-sm" onclick="promoteFromWaitlist(${p.id})" style="padding:4px 8px;">↑ Promote</button>`:'<span class="tag tg-gray">Slots Full</span>'}""",
    """          ${regularCount>=REGULAR_CAPACITY?`<span class="tag tg-gray" title="All ${REGULAR_CAPACITY} regular places are taken — promoting goes over the cap, and asks you first">${regularCount}/${REGULAR_CAPACITY} full</span>`:''}
          <button class="btn btn-success btn-sm" onclick="promoteFromWaitlist(${p.id})" style="padding:4px 8px;">↑ Promote</button>""")

f.write_text(s)
print("p100 applied")
