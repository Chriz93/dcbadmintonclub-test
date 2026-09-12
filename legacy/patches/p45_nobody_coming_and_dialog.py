# p45 (September 12, 2026): nobody coming, and the dialog for keyboard and screen-reader users.
#  - Start Session with nobody coming is refused with the reason, as it is for one player (a game needs two). A running
#    session can still end up with nobody left (Adjust courts: "Nobody is left to play this round.").
#  - The pop-up dialog is announced as a dialog named by its title, takes the keyboard focus when it opens, keeps Tab
#    inside it, closes with Escape, and gives the focus back to the control that opened it (found by the new
#    dialog-keyboard tests: focus stayed behind the dialog and Escape did nothing).
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""n===1?'Only one player is coming — a game needs at least two. Start the session when another player is coming.':'';}""",
    """n===1?'Only one player is coming — a game needs at least two. Start the session when another player is coming.':n===0?'Nobody is coming — a game needs at least two players. Start the session when players are coming.':'';}""")
sub("""  <div class="modal"><h3 id="modal-title"></h3><div id="modal-body"></div>""",
    """  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><h3 id="modal-title"></h3><div id="modal-body"></div>""")
sub("""function openModal(title,body){document.getElementById('modal-title').textContent=title;document.getElementById('modal-body').innerHTML=body;document.getElementById('modal').classList.add('open');}
function closeModal(){document.getElementById('modal').classList.remove('open');}""",
    """// The dialog takes the focus when it opens (so a screen reader announces its title), keeps Tab inside it, closes with
// Escape, and returns the focus to whatever opened it.
let _modalReturn=null;
function openModal(title,body){const m=document.getElementById('modal'),was=m.classList.contains('open');document.getElementById('modal-title').textContent=title;document.getElementById('modal-body').innerHTML=body;m.classList.add('open');if(!was){_modalReturn=document.activeElement;m.querySelector('.modal').focus({preventScroll:true});}}
function closeModal(){const m=document.getElementById('modal'),was=m.classList.contains('open');m.classList.remove('open');const r=_modalReturn;_modalReturn=null;if(was&&r&&r!==document.body&&document.contains(r)&&typeof r.focus==='function')r.focus({preventScroll:true});}
document.addEventListener('keydown',e=>{const m=document.getElementById('modal');if(!m||!m.classList.contains('open'))return;
  if(e.key==='Escape'){e.preventDefault();closeModal();return;}
  if(e.key!=='Tab')return;
  const box=m.querySelector('.modal'),f=[...box.querySelectorAll('button,[href],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled&&x.getClientRects().length);
  if(!f.length){e.preventDefault();box.focus();return;}
  const first=f[0],last=f[f.length-1],at=document.activeElement;
  if(e.shiftKey&&(at===first||at===box||!box.contains(at))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(at===last||!box.contains(at))){e.preventDefault();first.focus();}
});""")
sub(""".modal-ov{""", """.modal:focus{outline:none;}
.modal-ov{""")
f.write_text(s)
print("p45 applied")
