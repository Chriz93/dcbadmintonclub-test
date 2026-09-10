#!/usr/bin/env python3
"""Phase 6: white-and-green light theme. Tokens and chrome only; layout, copy and behaviour untouched."""
import pathlib, re
p = pathlib.Path("index.html"); s = p.read_text()
def rep(old, new, count=1):
    global s
    assert old in s, f"anchor missing: {old[:70]!r}"
    s = s.replace(old, new, count)
def rep_all(old, new, minimum=1):
    global s
    n = s.count(old); assert n >= minimum, (old[:60], n); s = s.replace(old, new); return n

# ── Tokens: white surfaces, deep green accent, dark ink ──────────────────────────────────────────
rep("""  --navy:#0b1220;--navy2:#141d31;--teal:#c9a84c;--teal2:#e9c46a;
  --green:#1f9d6a;--green2:#3ddc97;--red:#b83b4b;--red2:#f26d7d;
  --yellow:#d97706;--yellow2:#fbbf24;--gold:#e9c46a;--silver:#c9ced8;--bronze:#d08a4e;
  --bg:#070a12;--s1:#0e1422;--s2:#131b2c;--s3:#1a2437;--s4:#22304a;
  --border:rgba(255,255,255,0.08);--text:#f2efe6;--muted:#8d98ad;
  --ink:#141a26;--radius:16px;--shadow:0 12px 40px rgba(0,0,0,0.45);""",
"""  --navy:#ffffff;--navy2:#f1f7f3;--teal:#15803d;--teal2:#16a34a;
  --green:#16a34a;--green2:#15803d;--red:#dc2626;--red2:#b91c1c;
  --yellow:#d97706;--yellow2:#b45309;--gold:#ca8a04;--silver:#6b7280;--bronze:#b45309;
  --bg:#f4f7f5;--s1:#ffffff;--s2:#f1f5f2;--s3:#e6ede8;--s4:#d5e0d9;
  --border:#e1e8e3;--text:#0f1f16;--muted:#5f6f66;
  --ink:#ffffff;--radius:16px;--shadow:0 10px 30px rgba(15,31,22,0.10);
  color-scheme:light;""")
# gold-alpha tints become green tints
s = re.sub(r"rgba\(201,168,76,([0-9.]+)\)", r"rgba(22,163,74,\1)", s)
rep("rgba(233,196,106,", "rgba(22,163,74,")
rep('<meta name="theme-color" content="#0b1220">', '<meta name="theme-color" content="#15803d">')

# ── Chrome ───────────────────────────────────────────────────────────────────────────────────────
rep("body{background:radial-gradient(900px 480px at 50% -160px,rgba(22,163,74,0.12),transparent 65%),var(--bg);", "body{background:radial-gradient(900px 480px at 50% -160px,rgba(22,163,74,0.10),transparent 65%),var(--bg);")
rep(".nav{background:rgba(11,18,32,0.78);", ".nav{background:rgba(255,255,255,0.86);")
rep("box-shadow:0 8px 30px rgba(0,0,0,0.35);border-bottom:1px solid var(--border);}", "box-shadow:0 6px 24px rgba(15,31,22,0.06);border-bottom:1px solid var(--border);}")
rep(".nav-title{font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.2px;}", ".nav-title{font-size:16px;font-weight:800;color:var(--text);letter-spacing:-0.2px;}")
rep(".bnav{position:fixed;bottom:0;left:0;right:0;background:rgba(11,18,32,0.86);", ".bnav{position:fixed;bottom:0;left:0;right:0;background:rgba(255,255,255,0.92);")
rep(".card{background:linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0)),var(--s1);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px;box-shadow:0 6px 24px rgba(0,0,0,0.25);}",
    ".card{background:var(--s1);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px;box-shadow:0 4px 18px rgba(15,31,22,0.05);}")
rep(".card-title{font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:var(--teal2);margin-bottom:12px;}", ".card-title{font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:var(--teal);margin-bottom:12px;}")
rep(".btn-primary{background:linear-gradient(135deg,#e9c46a,#c9a84c);color:var(--ink);box-shadow:0 8px 24px rgba(22,163,74,0.22);}", ".btn-primary{background:linear-gradient(135deg,#22c55e,#15803d);color:#fff;box-shadow:0 8px 22px rgba(22,163,74,0.28);}")
rep(".btn-ghost{background:rgba(255,255,255,0.04);color:var(--text);border:1px solid var(--border);}", ".btn-ghost{background:#ffffff;color:var(--text);border:1px solid var(--border);}")
rep(".ptab{background:rgba(255,255,255,0.04);border:1px solid var(--border);", ".ptab{background:#ffffff;border:1px solid var(--border);")
rep(".ptab.active{background:linear-gradient(135deg,#e9c46a,#c9a84c);color:var(--ink);border-color:transparent;}", ".ptab.active{background:linear-gradient(135deg,#22c55e,#15803d);color:#fff;border-color:transparent;}")
rep(".modal-ov{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.88);", ".modal-ov{display:none;position:fixed;inset:0;background:rgba(15,31,22,0.55);backdrop-filter:blur(4px);")
rep(".modal h3{font-size:16px;font-weight:800;color:var(--teal2);margin-bottom:14px;}", ".modal h3{font-size:16px;font-weight:800;color:var(--teal);margin-bottom:14px;}")
rep(".pos-name{font-size:20px;font-weight:900;color:#fff;}", ".pos-name{font-size:20px;font-weight:900;color:var(--text);}")
rep(".pos-banner{background:linear-gradient(135deg,rgba(255,215,0,0.15),rgba(255,165,0,0.08));border:1px solid rgba(255,215,0,0.4);", ".pos-banner{background:linear-gradient(135deg,rgba(202,138,4,0.12),rgba(202,138,4,0.04));border:1px solid rgba(202,138,4,0.35);")
rep(".watermark{position:fixed;bottom:76px;right:8px;font-size:10px;color:rgba(106,139,168,0.3);", ".watermark{position:fixed;bottom:76px;right:8px;font-size:10px;color:rgba(95,111,102,0.45);")
rep(".vote-banner{background:linear-gradient(90deg,var(--gold),var(--yellow));padding:12px 14px;border-radius:8px;margin-bottom:10px;font-weight:800;text-align:center;color:#000;}", ".vote-banner{background:linear-gradient(90deg,#22c55e,#15803d);padding:12px 14px;border-radius:8px;margin-bottom:10px;font-weight:800;text-align:center;color:#fff;}")
rep(".reg-gate-banner{background:var(--yellow);color:#000;", ".reg-gate-banner{background:#fef3c7;color:#92400e;border:1px solid #fcd34d;")

# ── Hero and sign-in: the one deep-green surface ─────────────────────────────────────────────────
rep(".hero{background:linear-gradient(160deg,#182240 0%,#0f1628 55%,#0b1020 100%);border:1px solid rgba(22,163,74,0.28);", ".hero{background:linear-gradient(160deg,#166534 0%,#15803d 55%,#14532d 100%);border:1px solid rgba(22,163,74,0.35);")
rep(".hero::after{content:'';position:absolute;inset:0;background:radial-gradient(420px 200px at 50% 0%,rgba(22,163,74,0.18),transparent 70%);pointer-events:none;}", ".hero::after{content:'';position:absolute;inset:0;background:radial-gradient(420px 220px at 50% 0%,rgba(255,255,255,0.18),transparent 70%);pointer-events:none;}")
rep(".hero-club span{color:var(--teal2);}", ".hero-club span{color:#bbf7d0;}")
rep(".hero-league{font-size:13px;color:var(--muted);margin:4px 0 14px;}", ".hero-league{font-size:13px;color:rgba(255,255,255,0.78);margin:4px 0 14px;}")
rep(".hero-next{background:rgba(22,163,74,0.08);border:1px solid rgba(22,163,74,0.32);border-radius:14px;padding:14px;}", ".hero-next{background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.28);border-radius:14px;padding:14px;}")
rep(".hero-next-lbl{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--teal);font-weight:800;margin-bottom:4px;}", ".hero-next-lbl{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#bbf7d0;font-weight:800;margin-bottom:4px;}")
rep(".hero-next-sub{font-size:11px;color:var(--muted);margin-top:2px;}", ".hero-next-sub{font-size:11px;color:rgba(255,255,255,0.78);margin-top:2px;}")
rep(".cd-box{background:var(--s2);border-radius:8px;padding:8px 12px;text-align:center;flex:1;}", ".cd-box{background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:10px;padding:8px 12px;text-align:center;flex:1;}")
rep(".cd-num{font-size:22px;font-weight:900;color:var(--teal2);}", ".cd-num{font-size:22px;font-weight:900;color:#fff;}")
rep(".cd-lbl{font-size:10px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;margin-top:2px;}", ".cd-lbl{font-size:10px;color:rgba(255,255,255,0.75);letter-spacing:1px;text-transform:uppercase;margin-top:2px;}")
rep("#invite-gate{display:flex;align-items:center;justify-content:center;position:fixed;top:0;left:0;right:0;bottom:0;background:radial-gradient(700px 420px at 50% 0%,rgba(22,163,74,0.16),transparent 65%),var(--bg);", "#invite-gate{display:flex;align-items:center;justify-content:center;position:fixed;top:0;left:0;right:0;bottom:0;background:linear-gradient(180deg,#166534 0%,#15803d 38%,#f4f7f5 38.1%);")
rep(".invite-card{background:linear-gradient(180deg,#131b2c,#0e1422);border:1px solid rgba(22,163,74,0.28);", ".invite-card{background:#ffffff;border:1px solid var(--border);")
rep(".invite-btn{width:100%;padding:14px;min-height:48px;background:linear-gradient(135deg,#e9c46a,#c9a84c);color:var(--ink);", ".invite-btn{width:100%;padding:14px;min-height:48px;background:linear-gradient(135deg,#22c55e,#15803d);color:#fff;")

# ── Share image follows the theme ────────────────────────────────────────────────────────────────
rep("grad.addColorStop(0,'#182240');grad.addColorStop(1,'#070a12');", "grad.addColorStop(0,'#166534');grad.addColorStop(1,'#14532d');")
rep("x.fillStyle='#e9c46a';x.font='bold 64px Inter", "x.fillStyle='#bbf7d0';x.font='bold 64px Inter")
rep_all("x.fillStyle='#e9c46a';x.font='bold 84px", "x.fillStyle='#ffffff';x.font='bold 84px")
rep_all("x.fillStyle='#8d98ad';", "x.fillStyle='rgba(255,255,255,0.8)';", 2)
rep_all("x.fillStyle='#f2efe6';", "x.fillStyle='#ffffff';")
rep("""      <div style="width:30px;height:30px;border-radius:50%;background:${bg};color:#fff;display:flex;""","""      <div style="width:30px;height:30px;border-radius:50%;background:${bg};color:${done||act?'#fff':'var(--muted)'};display:flex;""")
rep("8 Sessions · Every Tuesday","28 Tuesdays · Sep 15, 2026 – May 18, 2027")
p.write_text(s); print("patched")
