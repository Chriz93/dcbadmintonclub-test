# p48 (September 12, 2026): the dialog returns the focus even when the control that opened it disabled itself.
#  - Adjust courts disables its button ("Checking…") while it loads the latest courts, and a disabled button loses the
#    focus, so by the time the preview opened the focus was on the page itself and closing the preview left keyboard
#    users at the top of the page (found by the new dialog tests). The page now remembers the last control focused
#    outside the dialog, and the dialog returns the focus there (or to the redrawn control with the same id).
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""let _modalReturn=null;
function openModal(title,body){const m=document.getElementById('modal'),was=m.classList.contains('open');document.getElementById('modal-title').textContent=title;document.getElementById('modal-body').innerHTML=body;m.classList.add('open');if(!was){_modalReturn=document.activeElement;m.querySelector('.modal').focus({preventScroll:true});}}""",
    """let _modalReturn=null,_lastFocus=null;
document.addEventListener('focusin',e=>{if(e.target instanceof HTMLElement&&!e.target.closest('#modal'))_lastFocus=e.target;});
function openModal(title,body){const m=document.getElementById('modal'),was=m.classList.contains('open');document.getElementById('modal-title').textContent=title;document.getElementById('modal-body').innerHTML=body;m.classList.add('open');if(!was){const a=document.activeElement;_modalReturn=a&&a!==document.body&&!a.closest('#modal')?a:_lastFocus;m.querySelector('.modal').focus({preventScroll:true});}}""")
f.write_text(s)
print("p48 applied")
