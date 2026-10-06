# p101 (October 5, 2026): going over the cap adds a regular place to the season, so the decision actually takes effect.
#  p100 asked the organizer to confirm going over the cap — and then the database refused it: set_state refuses an
#  approval that takes the approved regulars past regular_capacity ("Regular places are full; keep the player on the
#  waitlist"), and add_league_player refuses a new regular the same way. So the confirm led to a database error, which is
#  worse than the refusal it replaced.
#  L29 adds set_regular_capacity, the one thing that was missing: the number can now be moved during a season, by the
#  organizer, on the record (audit_log 'season.capacity'), and never below the regulars already approved.
#  Now "go over the cap" means what it says: the season gets one more regular place, the confirm says so before anything
#  happens, and the cap goes on doing its job at the new number — a player who registers into a full season still goes on
#  the waitlist. Adding a player by hand in Admin → Players offers the same decision instead of simply failing.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:110])
    s = s.replace(old, new)

sub("""// p100: the cap stops the registration form overfilling the season; it does not stop the organizer. Over the cap the
// organizer is told what they are about to make true and asked to confirm it.
function overCapOk(name,taken){
  if(taken<REGULAR_CAPACITY)return true;
  return confirm(`All ${REGULAR_CAPACITY} regular places are taken. Making ${name} a regular puts the season at ${taken+1} regulars, over the cap of ${REGULAR_CAPACITY}.\\n\\nThis is your call — go ahead?`);
}""",
    """// p100, p101: the cap stops the registration form overfilling the season; it does not stop the organizer. Over the cap
// the organizer is told what they are about to make true, and confirming adds the place to the season (L29) so the
// approval goes through instead of being refused by the database. Returns false when nothing should happen.
async function overCapOk(name,taken){
  if(taken<REGULAR_CAPACITY)return true;
  const want=taken+1;
  if(!confirm(`All ${REGULAR_CAPACITY} regular places are taken. Making ${name} a regular puts the season at ${want} regulars.\\n\\nThis is your call: confirming adds a place, so the season's regular places become ${want}. Go ahead?`))return false;
  try{await rpc('set_regular_capacity',{p_capacity:want});}
  catch(e){toast('The season still has '+REGULAR_CAPACITY+' regular places: '+e.message,'error');return false;}
  REGULAR_CAPACITY=want;
  return true;
}""")

sub("""  const regularCount=S.players.filter(x=>x.membershipType!=='spare'&&!x.waitlisted&&x.approved&&x.id!==id).length;
  if(!overCapOk(p.name,regularCount))return; // p100""",
    """  const regularCount=S.players.filter(x=>x.membershipType!=='spare'&&!x.waitlisted&&x.approved&&x.id!==id).length;
  if(!await overCapOk(p.name,regularCount))return; // p100, p101""")

sub("""  const taken=regularPlacesTaken(id); // p100
  if(taken>=REGULAR_CAPACITY){if(!overCapOk(p.name,taken))return;}""",
    """  const taken=regularPlacesTaken(id); // p100, p101
  if(taken>=REGULAR_CAPACITY){if(!await overCapOk(p.name,taken))return;}""")

sub("""    const regularCount=S.players.filter(x=>x.membershipType==='regular'&&!x.waitlisted&&x.sig&&x.sig!=='admin'&&x.id!==id).length;
    if(!overCapOk(p.name,regularCount))return; // p100""",
    """    const regularCount=S.players.filter(x=>x.membershipType==='regular'&&!x.waitlisted&&x.sig&&x.sig!=='admin'&&x.id!==id).length;
    if(!await overCapOk(p.name,regularCount))return; // p100, p101""")

# Adding a player by hand asks the same question instead of failing on the database's refusal.
sub(""" const existing=S.players.find(p=>p.name.toLowerCase()===name.toLowerCase());
 if(existing)return toast('This name is already on file. Open their player record to edit or approve it.','warn');""",
    """ const existing=S.players.find(p=>p.name.toLowerCase()===name.toLowerCase());
 if(existing)return toast('This name is already on file. Open their player record to edit or approve it.','warn');
 // p101: a new regular in a full season is the same decision as promoting one — ask it here too, rather than letting
 // add_league_player refuse with "Regular places are full".
 if(mtype==='regular'&&!await overCapOk(name,regularPlacesTaken()))return;""")

f.write_text(s)
print("p101 applied")
