#!/usr/bin/env python3
"""Phase 3b: polish after the visual review — header fits a phone, no hard-coded 8-session counts anywhere."""
import pathlib
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)
def rep_all(old, new, minimum=1):
    global s
    n = s.count(old); assert n >= minimum, (old[:60], n); s = s.replace(old, new); return n
# Header: brand on one line beside the status and sign-out control on a 375px phone.
rep(".nav-brand{display:flex;flex-direction:column;}", ".nav-brand{display:flex;flex-direction:column;min-width:0;}")
rep(".nav-sub{font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-top:1px;}", ".nav-sub{font-size:10px;color:var(--muted);letter-spacing:0.8px;text-transform:uppercase;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}")
rep('<div class="nav-sub">Maplewood Advanced League · 2026–27</div>', '<div class="nav-sub">Advanced League · 2026–27</div>')
rep(".sync-row{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);}", ".sync-row{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--muted);flex-shrink:0;white-space:nowrap;}")
# Season length comes from the permit dates, never a literal.
rep("`${S.sessions.length}/8 sessions done`", "`${S.sessions.length}/${DATES.length} sessions done`")
rep("doc.text(`Sessions Played: ${totalSess}/8`,mg,y);", "doc.text(`Sessions Played: ${totalSess}/${DATES.length}`,mg,y);")
rep_all("S.current.number<=8?P('State:numRange')", "S.current.number<=DATES.length?P('State:numRange')")
rep_all("S.current.number>=1&&S.current.number<=8?P('Stale:sessNum')", "S.current.number>=1&&S.current.number<=DATES.length?P('Stale:sessNum')")
rep_all("DATES.length===8?P('Cfg:8dates'):F('Cfg:8dates',DATES.length);", "DATES.length===APPROVED_DATES.length&&DATES.length>0?P('Cfg:dates'):F('Cfg:dates',DATES.length);")
rep_all("FD.length===8?P('Cfg:8FD'):F('Cfg:8FD',FD.length);", "FD.length===DATES.length?P('Cfg:FD'):F('Cfg:FD',FD.length);")
rep_all("DATES.length===8?P('INT:8dates'):F('INT:8dates',DATES.length);", "DATES.length===APPROVED_DATES.length?P('INT:dates'):F('INT:dates',DATES.length);")
# Manual add to a court respects the five-player Court 6.
rep("  if(a[court].length>=4)return toast('Court full','warn');\n  a[court].unshift(pid);", "  if(a[court].length>=courtCap(court))return toast('Court full','warn');\n  a[court].unshift(pid);")
p.write_text(s); print("patched")
