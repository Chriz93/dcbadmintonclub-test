# p41b (September 12, 2026): after Apply — saved, refused because someone else saved first, or failed — the Adjust
# courts button is drawn again as soon as the step finishes; before, it stayed greyed out until the tab was redrawn
# for another reason.
import pathlib
f = pathlib.Path(__file__).resolve().parents[2] / "index.html"
s = f.read_text()
def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, (n, old[:90])
    s = s.replace(old, new)

sub("""  }catch(e){if(!(e.code==='40001'||/Stale state/.test(e.message||'')))toast('Courts not changed: '+(e.message||'check the connection')+'. Try again.','error');closeModal();_adjProposal=null;await loadAll();renderAll();}
  finally{_adjusting=false;}
}""", """  }catch(e){if(!(e.code==='40001'||/Stale state/.test(e.message||'')))toast('Courts not changed: '+(e.message||'check the connection')+'. Try again.','error');closeModal();_adjProposal=null;await loadAll();renderAll();}
  finally{_adjusting=false;renderAttendanceTab();}
}""")
f.write_text(s)
print("p41b applied")
