#!/usr/bin/env python3
"""Phase 3: visual refresh. Midnight-and-gold palette on the existing tokens, Inter typography, glass navigation,
larger tap targets, minimum 10px text, organizer tab only for organizers. Layout and behaviour are unchanged."""
import pathlib, re
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)
def rep_all(old, new, minimum=1):
    global s
    n = s.count(old); assert n >= minimum, (old[:60], n); s = s.replace(old, new); return n

# ── Tokens ──────────────────────────────────────────────────────────────────────────────────────
rep("""  --navy:#0d2137;--navy2:#1a3a5c;--teal:#0099cc;--teal2:#00c2ff;
  --green:#27ae60;--green2:#2ecc71;--red:#c0392b;--red2:#e74c3c;
  --yellow:#f39c12;--yellow2:#f1c40f;--gold:#ffd700;--silver:#c0c0c0;--bronze:#cd7f32;
  --bg:#080e17;--s1:#0f1d2e;--s2:#162540;--s3:#1e3254;--s4:#243a52;
  --border:#243a52;--text:#e8f4fd;--muted:#6a8ba8;
  --font:'Segoe UI',system-ui,-apple-system,sans-serif;""",
"""  --navy:#0b1220;--navy2:#141d31;--teal:#c9a84c;--teal2:#e9c46a;
  --green:#1f9d6a;--green2:#3ddc97;--red:#b83b4b;--red2:#f26d7d;
  --yellow:#d97706;--yellow2:#fbbf24;--gold:#e9c46a;--silver:#c9ced8;--bronze:#d08a4e;
  --bg:#070a12;--s1:#0e1422;--s2:#131b2c;--s3:#1a2437;--s4:#22304a;
  --border:rgba(255,255,255,0.08);--text:#f2efe6;--muted:#8d98ad;
  --ink:#141a26;--radius:16px;--shadow:0 12px 40px rgba(0,0,0,0.45);
  --font:'Inter',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;""")
rep_all("rgba(0,153,204,", "rgba(201,168,76,", 10)
rep_all("rgba(0,194,255,", "rgba(233,196,106,")
rep("info:'#0099cc'", "info:'#c9a84c'")
rep('<meta name="theme-color" content="#0d2137">', '<meta name="theme-color" content="#0b1220">')
rep('<link rel="manifest" href="manifest.json">', '''<link rel="manifest" href="manifest.json">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap">''')

# ── Base, navigation ─────────────────────────────────────────────────────────────────────────────
rep("body{background:var(--bg);color:var(--text);font-family:var(--font);padding-bottom:72px;}",
    "body{background:radial-gradient(900px 480px at 50% -160px,rgba(201,168,76,0.12),transparent 65%),var(--bg);color:var(--text);font-family:var(--font);padding-bottom:84px;line-height:1.45;-webkit-font-smoothing:antialiased;}\n:focus-visible{outline:2px solid var(--teal2);outline-offset:2px;}")
rep(".nav{background:var(--navy);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200;box-shadow:0 2px 20px rgba(0,0,0,0.6);border-bottom:1px solid var(--border);}",
    ".nav{background:rgba(11,18,32,0.78);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:200;box-shadow:0 8px 30px rgba(0,0,0,0.35);border-bottom:1px solid var(--border);}")
rep(".nav-title{font-size:15px;font-weight:800;color:#fff;}", ".nav-title{font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.2px;}")
rep(".bnav{position:fixed;bottom:0;left:0;right:0;background:var(--navy);border-top:1px solid var(--border);display:flex;z-index:200;padding-bottom:env(safe-area-inset-bottom);}",
    ".bnav{position:fixed;bottom:0;left:0;right:0;background:rgba(11,18,32,0.86);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-top:1px solid var(--border);display:flex;z-index:200;padding-bottom:env(safe-area-inset-bottom);}")
rep(".bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:7px 2px;border:none;background:transparent;color:var(--muted);font-size:8px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;cursor:pointer;gap:3px;transition:color 0.2s;}\n.bnav-btn .bi{font-size:19px;}\n.bnav-btn.active{color:var(--teal2);}",
    ".bnav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 2px 6px;border:none;background:transparent;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;cursor:pointer;gap:3px;transition:color 0.2s;min-height:56px;}\n.bnav-btn .bi{font-size:20px;padding:2px 12px;border-radius:12px;transition:background 0.2s;}\n.bnav-btn.active{color:var(--teal2);}\n.bnav-btn.active .bi{background:rgba(201,168,76,0.16);}")

# ── Surfaces, inputs, buttons ────────────────────────────────────────────────────────────────────
rep(".card{background:var(--s1);border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:12px;}",
    ".card{background:linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0)),var(--s1);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px;box-shadow:0 6px 24px rgba(0,0,0,0.25);}")
rep(".card-title{font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:var(--teal);margin-bottom:12px;}",
    ".card-title{font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:var(--teal2);margin-bottom:12px;}")
rep(".inp{width:100%;background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:11px 13px;color:var(--text);font-size:15px;transition:border 0.2s;margin-bottom:8px;}\n.inp:focus{outline:none;border-color:var(--teal);}",
    ".inp{width:100%;background:var(--s2);border:1px solid var(--border);border-radius:12px;padding:13px 14px;color:var(--text);font-size:16px;transition:border 0.2s,box-shadow 0.2s;margin-bottom:8px;}\n.inp:focus{outline:none;border-color:var(--teal);box-shadow:0 0 0 3px rgba(201,168,76,0.18);}")
rep(".btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:12px 18px;border-radius:10px;border:none;font-size:14px;font-weight:700;cursor:pointer;transition:all 0.15s;width:100%;margin-top:8px;letter-spacing:0.3px;}",
    ".btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:13px 18px;min-height:46px;border-radius:12px;border:none;font-size:15px;font-weight:700;cursor:pointer;transition:all 0.15s;width:100%;margin-top:8px;letter-spacing:0.2px;}\n.btn:hover{filter:brightness(1.06);}")
rep(".btn-primary{background:var(--teal);color:#fff;}", ".btn-primary{background:linear-gradient(135deg,#e9c46a,#c9a84c);color:var(--ink);box-shadow:0 8px 24px rgba(201,168,76,0.22);}")
rep(".btn-ghost{background:var(--s3);color:var(--text);border:1px solid var(--border);}", ".btn-ghost{background:rgba(255,255,255,0.04);color:var(--text);border:1px solid var(--border);}")
rep(".btn-sm{padding:7px 12px;font-size:12px;width:auto;margin-top:0;}", ".btn-sm{padding:8px 12px;min-height:36px;font-size:12px;width:auto;margin-top:0;}")
rep(".ptab{background:var(--s2);border:1px solid transparent;color:var(--muted);font-size:12px;font-weight:700;padding:7px 14px;border-radius:20px;cursor:pointer;white-space:nowrap;flex-shrink:0;}\n.ptab.active{background:var(--teal);color:#fff;}",
    ".ptab{background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--muted);font-size:13px;font-weight:700;padding:9px 16px;min-height:38px;border-radius:20px;cursor:pointer;white-space:nowrap;flex-shrink:0;}\n.ptab.active{background:linear-gradient(135deg,#e9c46a,#c9a84c);color:var(--ink);border-color:transparent;}")
rep(".vt-btn.active{background:var(--teal);color:#fff;border-color:var(--teal);}", ".vt-btn.active{background:var(--teal);color:var(--ink);border-color:var(--teal);}")
rep(".vote-btn{padding:6px 12px;font-size:12px;background:var(--teal);border:none;border-radius:6px;color:#fff;", ".vote-btn{padding:8px 14px;font-size:12px;background:var(--teal);border:none;border-radius:8px;color:var(--ink);")
rep(".gc-add-btn{display:none;position:absolute;bottom:4px;right:4px;background:var(--teal);color:#fff;", ".gc-add-btn{display:none;position:absolute;bottom:4px;right:4px;background:var(--teal);color:var(--ink);")
rep(".sdot-s.act{background:var(--teal);color:#fff;}", ".sdot-s.act{background:var(--teal);color:var(--ink);}")
rep_all("background:var(--teal);color:#fff", "background:var(--teal);color:var(--ink)")
rep(".modal{background:var(--s1);border:1px solid var(--border);border-radius:14px;padding:20px;width:100%;max-width:440px;max-height:88vh;overflow-y:auto;}",
    ".modal{background:var(--s1);border:1px solid var(--border);border-radius:20px;padding:22px;width:100%;max-width:440px;max-height:88vh;overflow-y:auto;box-shadow:var(--shadow);}")
rep(".page-title{font-size:20px;font-weight:800;margin-bottom:2px;}", ".page-title{font-size:23px;font-weight:800;margin-bottom:2px;letter-spacing:-0.3px;}")
rep(".lbrow{display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:10px;", ".lbrow{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;")

# ── Home hero and sign-in ────────────────────────────────────────────────────────────────────────
rep(".hero{background:linear-gradient(135deg,var(--navy2),var(--navy));border:1px solid var(--border);border-radius:14px;padding:20px;margin-bottom:14px;text-align:center;position:relative;overflow:hidden;}",
    ".hero{background:linear-gradient(160deg,#182240 0%,#0f1628 55%,#0b1020 100%);border:1px solid rgba(201,168,76,0.28);border-radius:20px;padding:26px 20px 22px;margin-bottom:14px;text-align:center;position:relative;overflow:hidden;box-shadow:var(--shadow);}\n.hero::after{content:'';position:absolute;inset:0;background:radial-gradient(420px 200px at 50% 0%,rgba(201,168,76,0.18),transparent 70%);pointer-events:none;}\n.hero>*{position:relative;z-index:1;}")
rep(".hero-club{font-size:22px;font-weight:900;color:#fff;}", ".hero-club{font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.4px;}")
rep(".hero-next{background:rgba(201,168,76,0.1);border:1px solid rgba(201,168,76,0.3);border-radius:10px;padding:12px;}", ".hero-next{background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.32);border-radius:14px;padding:14px;}")
rep(".hero-next-date{font-size:18px;font-weight:800;color:#fff;}", ".hero-next-date{font-size:20px;font-weight:800;color:#fff;}")
rep("#invite-gate{display:flex;align-items:center;justify-content:center;position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg);",
    "#invite-gate{display:flex;align-items:center;justify-content:center;position:fixed;top:0;left:0;right:0;bottom:0;background:radial-gradient(700px 420px at 50% 0%,rgba(201,168,76,0.16),transparent 65%),var(--bg);")
rep(".invite-card{background:var(--s2);border:2px solid var(--border);border-radius:12px;padding:30px;text-align:center;max-width:400px;width:100%;}",
    ".invite-card{background:linear-gradient(180deg,#131b2c,#0e1422);border:1px solid rgba(201,168,76,0.28);border-radius:22px;padding:32px 26px;text-align:center;max-width:400px;width:100%;box-shadow:var(--shadow);}")
rep(".invite-inp{width:100%;padding:12px;font-size:16px;text-align:center;letter-spacing:2px;border:1px solid var(--border);background:var(--s1);color:var(--text);border-radius:8px;margin-bottom:12px;}",
    ".invite-inp{width:100%;padding:14px;font-size:17px;text-align:center;letter-spacing:2px;border:1px solid var(--border);background:var(--s1);color:var(--text);border-radius:12px;margin-bottom:12px;}\n.invite-inp:focus{outline:none;border-color:var(--teal);box-shadow:0 0 0 3px rgba(201,168,76,0.18);}")
rep(".invite-btn{width:100%;padding:12px;background:var(--teal);color:var(--ink);border:0;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;}\n.invite-btn:hover{background:var(--teal2);}",
    ".invite-btn{width:100%;padding:14px;min-height:48px;background:linear-gradient(135deg,#e9c46a,#c9a84c);color:var(--ink);border:0;border-radius:12px;font-size:15px;font-weight:800;cursor:pointer;}\n.invite-btn:hover{filter:brightness(1.06);}")

# ── Readability floor: nothing smaller than 10px ────────────────────────────────────────────────
rep_all("font-size:7px", "font-size:9px")
rep_all("font-size:8px", "font-size:10px")
rep_all("font-size:9px", "font-size:11px")

# ── Players see five tabs; the organizer tab appears only for organizers ─────────────────────────
rep("""  // Admin tab is ALWAYS visible — tapping it prompts for PIN if not unlocked
  admin.style.display = 'flex';""", """  // Only organizers see the Admin tab (verification with the authenticator still happens inside it).
  admin.style.display = (typeof S_me==='object'&&S_me&&S_me.organizer)?'flex':'none';""")
p.write_text(s); print("patched")
