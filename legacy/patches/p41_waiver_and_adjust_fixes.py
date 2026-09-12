# p41 (September 12, 2026): two fixes found by the new browser suites.
#  - Registration step 2 shows the waiver text again whenever the text loaded differs (by its SHA-256), not only when the
#    version name differs; after a refused registration the page always shows exactly the wording that was reloaded.
#  - Pressing Adjust courts while the previous change is still being saved says so ("Still working on the last change —
#    try again in a moment") instead of doing nothing silently.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""  if(!w){box.innerHTML=`<div class="wv-loading${S.waiverError?' wv-error':''}" role="${S.waiverError?'alert':'status'}">${esc(S.waiverError||'Loading the waiver…')}</div>`;delete box.dataset.version;if(meta)meta.textContent='';if(inl)inl.textContent='';return;}
  if(box.dataset.version!==w.version){box.innerHTML=waiverHtml(w.body);box.dataset.version=w.version;}""",
    """  if(!w){box.innerHTML=`<div class="wv-loading${S.waiverError?' wv-error':''}" role="${S.waiverError?'alert':'status'}">${esc(S.waiverError||'Loading the waiver…')}</div>`;delete box.dataset.version;delete box.dataset.sha;if(meta)meta.textContent='';if(inl)inl.textContent='';return;}
  if(box.dataset.sha!==w.sha){box.innerHTML=waiverHtml(w.body);box.dataset.version=w.version;box.dataset.sha=w.sha;}""")
sub("""  if(!adminUnlocked)return toast('Organizer verification required','warn');
  if(_adjusting)return;
  if(!S.current)return toast('Start the session first""", """  if(!adminUnlocked)return toast('Organizer verification required','warn');
  if(_adjusting)return toast('Still working on the last change — try again in a moment','info');
  if(!S.current)return toast('Start the session first""")
f.write_text(s)
print("p41 applied")
