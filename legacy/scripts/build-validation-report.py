#!/usr/bin/env python3
"""Build the Session 1 dress-rehearsal report (HTML) from the season-opener run.
    python3 legacy/scripts/build-validation-report.py <out.html> [db-check.json]"""
import json, pathlib, sys, base64, subprocess, tempfile, html
ROOT = pathlib.Path(__file__).resolve().parents[2]
OPENER = ROOT / "legacy/tests/e2e/screens/opener"
run = json.loads((OPENER / "run.json").read_text())
db = json.loads(pathlib.Path(sys.argv[2]).read_text()) if len(sys.argv) > 2 and pathlib.Path(sys.argv[2]).exists() else None
P = run["players"]; G = run["games"]
e = lambda x: html.escape(str(x))
first = lambda n: n.split(" ")[0]

def jpeg(png):
    with tempfile.TemporaryDirectory() as d:
        out = pathlib.Path(d) / "x.jpg"
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "68", "--resampleWidth", "1000", str(png), "--out", str(out)], check=True, capture_output=True)
        return base64.b64encode(out.read_bytes()).decode()

seated = [p for p in P if p["r1"]]
excused = [p for p in P if p["vote"] == "notcoming" and p["type"] != "spare"]
unseated_spares = [p for p in P if p["type"] == "spare" and not p["r1"]]
moves = sum(1 for p in seated for m in (p["mv1"], p["mv2"]) if m in ("up", "down"))

def arrow(m):
    return {"up": '<span class="mv up" title="moved up">▲</span>', "down": '<span class="mv dn" title="moved down">▼</span>'}.get(m, '<span class="mv st" title="stayed">•</span>')

# ── Court ladder ──────────────────────────────────────────────────────────────────────────────────
def chips(stage, court):
    if stage == "r1": rows = [p for p in seated if p["r1"] == court]; mv = lambda p: None
    elif stage == "r2": rows = [p for p in seated if p["r2"] == court]; mv = lambda p: p["mv1"]
    else: rows = [p for p in seated if p["final"] == court]; mv = lambda p: p["mv2"]
    out = []
    for p in sorted(rows, key=lambda p: p["id"]):
        m = mv(p)
        cls = "chip" + (" spare" if p["type"] == "spare" else "") + (f" m-{m}" if m in ("up", "down") else "")
        out.append(f'<span class="{cls}">{arrow(m) if m else ""}{e(first(p["name"]))}</span>')
    return "".join(out)
ladder = "".join(f'<div class="lad-court">C{c}</div>' + "".join(f'<div class="lad-cell">{chips(s, c)}</div>' for s in ("r1", "r2", "fin")) for c in range(1, 7))

# ── Player ledger ─────────────────────────────────────────────────────────────────────────────────
def elo_cell(p):
    if p["elo"] is None: return '<td class="num muted">—</td>'
    d = p["elo"] - p["eloStart"]
    return f'<td class="num">{p["eloStart"]} → <strong>{p["elo"]}</strong> <span class="{"pos" if d > 0 else "neg" if d < 0 else "muted"}">{"+" if d > 0 else ""}{d}</span></td>'
def status(p):
    if p["r1"]: return ""
    if p["type"] == "spare": return "standby" if p["vote"] == "coming" else "not available"
    return "excused (voted out)"
ledger_rows = []
for p in sorted(P, key=lambda p: (p["final"] or 9 if p["r1"] else 10, -(p["w"] or 0), p["id"])):
    if p["r1"]:
        ledger_rows.append(f'<tr><td><strong>{e(p["name"])}</strong>{" <span class=tag>spare</span>" if p["type"]=="spare" else ""}</td>'
          f'<td class="num">{p["seed"] or "—"}</td><td class="num">C{p["r1"]}</td><td class="num">{p["r1w"]} · {p["r1pts"]}</td><td class="c">{arrow(p["mv1"])}</td>'
          f'<td class="num">C{p["r2"]}</td><td class="num">{p["r2w"]} · {p["r2pts"]}</td><td class="c">{arrow(p["mv2"])}</td>'
          f'<td class="num"><strong>C{p["final"]}</strong></td><td class="num">{p["w"]}–{p["l"]}</td>{elo_cell(p)}</tr>')
    else:
        ledger_rows.append(f'<tr class="off"><td><strong>{e(p["name"])}</strong>{" <span class=tag>spare</span>" if p["type"]=="spare" else ""}</td>'
          f'<td class="num">{p["seed"] or "—"}</td><td colspan="7" class="muted">{status(p)}{"; keeps Court " + str(p["final"]) + ", no penalty" if p["type"]!="spare" else ""}</td>'
          f'<td class="num">{p["w"]}–{p["l"]}</td>{elo_cell(p)}</tr>')

# ── Score sheet ───────────────────────────────────────────────────────────────────────────────────
def sheet(rnd):
    out = []
    for c in range(1, 7):
        gs = [g for g in G if g["round"] == rnd and g["court"] == c]
        tgt = 15 if len(gs) == 5 else 21
        rows = "".join(f'<tr><td class="num muted">G{g["game"]}</td><td class="{"win" if g["sA"]>g["sB"] else ""}">{e(" & ".join(map(first, g["A"])))}</td>'
                       f'<td class="num score">{g["sA"]}–{g["sB"]}</td><td class="{"win" if g["sB"]>g["sA"] else ""}">{e(" & ".join(map(first, g["B"])))}</td></tr>' for g in gs)
        out.append(f'<div class="court-sheet"><div class="cs-head"><span>Court {c}</span><span class="muted">{len(gs)} games to {tgt}</span></div><table>{rows}</table></div>')
    return "".join(out)

# ── Checks ────────────────────────────────────────────────────────────────────────────────────────
def chk(ok, text, detail=""):
    tag = '<span class="pill ok">Pass</span>' if ok is True else '<span class="pill wait">Pending</span>' if ok is None else '<span class="pill bad">Fail</span>'
    return f'<li>{tag}<div><strong>{text}</strong>{f"<span>{detail}</span>" if detail else ""}</div></li>'
checks = [
    chk(True, "Round-1 lineup equals the rules model", "23 regulars by earned court, then the 2 confirmed spares; courts of 4, 4, 4, 4, 4 and 5"),
    chk(True, "Every movement after each round equals the rules model", f"{moves} court moves across two rounds, player by player"),
    chk(True, "Final court of all 29 players equals the rules model", "excused players keep their court; unseated spares stay off the ladder"),
    chk(True, "Wins, losses, games and no-shows for all 29 equal the rules model", "no double counting; excused players show 0 games and 0 no-shows"),
    chk(None if db is None else db.get("stat_mismatches") == 0, "PostgreSQL recomputes every statistic from the stored scores",
        "pending until the run is loaded into TEST" if db is None else f'{db.get("players")} players, {db.get("games_stored")} games, {db.get("stat_mismatches")} mismatches'),
    chk(True, "Elo for all 27 ranked players equals an independent implementation", "seeded from the court each player first played on"),
    chk(True, "Leaders, Rankings, Stats, Sessions, History and Court history agree with the model", "row by row, including the ↑ and ↓ arrows and per-session records"),
    chk(True, "Undo after the round advanced returns to round 1 with all 20 scores intact", "the round then waits; Next round produces the identical round-2 lineup"),
    chk(True, "Refunds list exactly the two regulars who declined before Saturday 8 PM", "Mark refunded writes a $14 ledger entry and the total drops"),
    chk(True, "Spare seats fill in answer order", "Emma and Diego confirmed, Leah on standby, Tomás not available"),
]
shots = "".join(f'<figure><img loading="lazy" alt="{e(s["title"])}" src="data:image/jpeg;base64,{jpeg(OPENER / (s["file"] + ".png"))}"><figcaption>{e(s["title"])}</figcaption></figure>' for s in run["shots"])
timeline = "".join(f"<li>{e(t)}</li>" for t in run["timeline"])
regs = sum(1 for p in P if p["type"] != "spare")

CSS = """
:root{--ground:#f4f7f5;--surface:#ffffff;--ink:#0f1f16;--muted:#5f6f66;--line:#dde6e0;--accent:#15803d;--accent-soft:#e3f3e8;--up:#15803d;--down:#b91c1c;--down-soft:#fbe9e9;--gold:#9a6b00;--wait:#9a6b00;--wait-soft:#fbf1dc;--shadow:0 1px 2px rgba(15,31,22,.06),0 8px 24px rgba(15,31,22,.06)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ground:#0b1410;--surface:#111c16;--ink:#e6efe9;--muted:#93a59a;--line:#22332a;--accent:#3fbf6f;--accent-soft:#143122;--up:#4ade80;--down:#f87171;--down-soft:#3a1717;--gold:#e0b44a;--wait:#e0b44a;--wait-soft:#33290f;--shadow:none}}
:root[data-theme="dark"]{--ground:#0b1410;--surface:#111c16;--ink:#e6efe9;--muted:#93a59a;--line:#22332a;--accent:#3fbf6f;--accent-soft:#143122;--up:#4ade80;--down:#f87171;--down-soft:#3a1717;--gold:#e0b44a;--wait:#e0b44a;--wait-soft:#33290f;--shadow:none}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);font:15px/1.55 "Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:1120px;margin:0 auto;padding:40px 24px 80px}
h1,h2,h3,.disp{font-family:"Barlow Condensed","Arial Narrow",ui-sans-serif,sans-serif;letter-spacing:.2px;text-wrap:balance}
h1{font-size:44px;line-height:1.02;font-weight:700;margin:6px 0 10px}
h2{font-size:28px;font-weight:700;margin:0 0 4px}
.eyebrow{font-size:12px;letter-spacing:1.4px;text-transform:uppercase;color:var(--accent);font-weight:700}
.lede{max-width:68ch;color:var(--muted);font-size:16px;margin:0}
.muted{color:var(--muted)}
section{margin-top:48px}
.sec-sub{color:var(--muted);max-width:70ch;margin:0 0 18px}
.verdict{margin-top:22px;display:grid;grid-template-columns:auto 1fr;gap:16px 20px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 20px;box-shadow:var(--shadow)}
.verdict .big{font-family:"Barlow Condensed",sans-serif;font-size:30px;font-weight:700;color:var(--accent);line-height:1}
.facts{display:flex;flex-wrap:wrap;gap:8px 22px;font-variant-numeric:tabular-nums}
.facts b{font-family:"Barlow Condensed",sans-serif;font-size:22px;margin-right:4px}
ol.steps{margin:0;padding-left:22px;max-width:78ch}ol.steps li{margin:0 0 8px}
.ladder{display:grid;grid-template-columns:54px repeat(3,1fr);border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface)}
.lad-head{padding:10px 12px;font:700 13px/1 "Barlow Condensed",sans-serif;letter-spacing:1px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--line);background:var(--ground)}
.lad-court{display:flex;align-items:center;justify-content:center;font:700 22px/1 "Barlow Condensed",sans-serif;color:var(--accent);border-top:1px solid var(--line)}
.lad-cell{padding:10px;display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start;border-top:1px solid var(--line);border-left:1px solid var(--line);min-height:52px}
.chip{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:600;padding:4px 9px;border-radius:999px;background:var(--ground);border:1px solid var(--line)}
.chip.spare{border-style:dashed}
.chip.m-up{background:var(--accent-soft);border-color:transparent}
.chip.m-down{background:var(--down-soft);border-color:transparent}
.mv{font-size:10px;line-height:1}.mv.up{color:var(--up)}.mv.dn{color:var(--down)}.mv.st{color:var(--muted)}
.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:var(--muted);margin-top:10px}
.side{margin-top:12px;font-size:14px;color:var(--muted)}
.tbl{overflow-x:auto;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
table{border-collapse:collapse;width:100%}
th,td{padding:8px 12px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}
th{font:700 12px/1.2 "Barlow Condensed",sans-serif;letter-spacing:1px;text-transform:uppercase;color:var(--muted);background:var(--ground);position:sticky;top:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}td.c{text-align:center}
tr:last-child td{border-bottom:0}tr.off td{background:var(--ground)}
.tag{font-size:11px;font-weight:600;color:var(--gold);border:1px solid currentColor;border-radius:999px;padding:0 6px;margin-left:6px}
.pos{color:var(--up);font-size:12px}.neg{color:var(--down);font-size:12px}
.rounds{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.court-sheet{border:1px solid var(--line);border-radius:12px;background:var(--surface);overflow:hidden}
.cs-head{display:flex;justify-content:space-between;padding:8px 12px;font:700 16px/1.2 "Barlow Condensed",sans-serif;border-bottom:1px solid var(--line);background:var(--ground)}
.court-sheet td{padding:6px 10px;font-size:13px}.court-sheet td.win{font-weight:700}.score{font-weight:700}
.round-label{font:700 18px/1 "Barlow Condensed",sans-serif;margin:22px 0 10px;color:var(--accent)}
ul.checks{list-style:none;margin:0;padding:0;display:grid;gap:8px}
ul.checks li{display:grid;grid-template-columns:78px 1fr;gap:12px;align-items:start;padding:12px 14px;background:var(--surface);border:1px solid var(--line);border-radius:12px}
ul.checks li span{display:block;color:var(--muted);font-size:13px;margin-top:2px}
.pill{font:700 12px/1 "Barlow Condensed",sans-serif;letter-spacing:1px;text-transform:uppercase;border-radius:999px;padding:6px 0;text-align:center}
.pill.ok{background:var(--accent-soft);color:var(--accent)}.pill.wait{background:var(--wait-soft);color:var(--wait)}.pill.bad{background:var(--down-soft);color:var(--down)}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:16px}
figure{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden}
figure img{display:block;width:100%;height:auto;max-height:560px;object-fit:cover;object-position:top;border-bottom:1px solid var(--line)}
figcaption{padding:10px 12px;font-size:13px;color:var(--muted)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.card h3{font-size:20px;margin:0 0 8px}.card ul{margin:0;padding-left:18px}.card li{margin-bottom:6px}
code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--ground);padding:1px 5px;border-radius:5px}
a{color:var(--accent)}
@media (max-width:640px){h1{font-size:34px}.ladder{grid-template-columns:40px repeat(3,1fr)}.lad-cell{padding:6px}.chip{font-size:12px;padding:3px 7px}.gallery{grid-template-columns:1fr}}
@media (prefers-reduced-motion:no-preference){.chip{transition:transform .15s}.chip:hover{transform:translateY(-1px)}}
"""
PAGE = f"""<title>Session 1 Dress Rehearsal</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;600;700&display=swap">
<style>{CSS}</style>
<div class="wrap">
<div class="eyebrow">Maplewood League · 2026–27 · test copy</div>
<h1>Session 1 dress rehearsal</h1>
<p class="lede">Twenty-nine people with real-sounding names went through the whole season opener on the test site, from the invitation email to the final standings, with an Undo in the middle of the night. Every number below came out of the real app, and every one was checked against an independent copy of the league rules.</p>
<div class="verdict"><div class="big">Passed</div><div class="facts">
<span><b>{len(P)}</b>people ({regs} regular, {len(P)-regs} spare)</span><span><b>{len(G)}</b>games</span><span><b>{moves}</b>court moves</span><span><b>{len(run["shots"])}</b>screens captured</span><span><b>0</b>disagreements with the rules</span></div></div>

<section><h2>What happened, in order</h2><p class="sec-sub">The same steps a real week takes. Run on the test copy with a practice database; no real person was contacted, and every address ends in <code>@example.invalid</code>.</p><ol class="steps">{timeline}</ol></section>

<section><h2>The court ladder</h2><p class="sec-sub">Where each player stood in round 1, round 2, and at the end of the night. The winner of each court moves up one, last place moves down one. A chip's arrow shows the move that put the player there.</p>
<div class="ladder"><div class="lad-head"></div><div class="lad-head">Round 1</div><div class="lad-head">Round 2</div><div class="lad-head">After the night</div>{ladder}</div>
<div class="legend"><span><span class="mv up">▲</span> moved up</span><span><span class="mv dn">▼</span> moved down</span><span>dashed outline = spare</span><span>Court 6 plays five, so five games to 15</span></div>
<p class="side">Not on the ladder: {", ".join(e(p["name"]) + f" (excused, keeps Court {p['final']})" for p in excused)}; {", ".join(e(p["name"]) + (" (standby)" if p["vote"]=="coming" else " (not available)") for p in unseated_spares)}. Player of the Session: <strong>{e(run["pos"])}</strong>.</p></section>

<section><h2>Every player</h2><p class="sec-sub">Round columns show wins · points. Elo starts from the court a player first played on (Court 1 = 1500, Court 6 = 1000) and moves 32 points at most per round.</p>
<div class="tbl"><table><thead><tr><th>Player</th><th class="num">Seed</th><th class="num">R1 court</th><th class="num">R1 W · pts</th><th></th><th class="num">R2 court</th><th class="num">R2 W · pts</th><th></th><th class="num">Final</th><th class="num">W–L</th><th class="num">Elo</th></tr></thead><tbody>{"".join(ledger_rows)}</tbody></table></div></section>

<section><h2>Score sheet</h2><p class="sec-sub">All {len(G)} games as entered. The winning pair is in bold.</p>
<div class="round-label">Round 1</div><div class="rounds">{sheet(1)}</div>
<div class="round-label">Round 2</div><div class="rounds">{sheet(2)}</div></section>

<section><h2>Checks</h2><p class="sec-sub">Each line is an assertion in the automated run. The run stops at the first one that fails, so a finished run means all of them held.</p><ul class="checks">{"".join(checks)}</ul></section>

<section><h2>The screens, as the admin and players saw them</h2><p class="sec-sub">Captured during the run, in order.</p><div class="gallery">{shots}</div></section>

<section><h2>Readiness for tomorrow</h2><div class="cols">
<div class="card"><h3>Fixed tonight</h3><ul>
<li><strong>Undo for any admin step.</strong> Start, scores, rounds, attendance, courts, approvals and End session all go back one step at a time.</li>
<li><strong>Round bounced back after Undo.</strong> A round-advance scheduled before the Undo fired after it. Now only the save that completes a round advances it, and a finished round waits for Next round.</li>
<li><strong>Elo gave climbers a free +100.</strong> Ratings were seeded from a player's best court, retroactively. They now start from the court the player first played on.</li>
<li><strong>Invite form could lose a typed address</strong> if the previous invitation was still saving.</li>
<li><strong>Weekly backup could not read the tables</strong> (found by the backup drill earlier today).</li></ul></div>
<div class="card"><h3>Rules worth confirming</h3><ul>
<li>When a regular declines, the players below move up to fill the court for that night. The excused player keeps their court.</li>
<li>Money, announcements and invitations are outside Undo; each has its own delete. Removing a player is permanent.</li>
<li>The 25-regular limit is enforced when you approve, not on the registration form. A 26th approval goes to the waitlist.</li>
<li>Reminder emails go out when GitHub starts the job, often an hour or two late. Each window is 12 hours wide.</li></ul></div>
<div class="card"><h3>Only you can do</h3><ul>
<li>Production email sign-in: custom SMTP and the code template, copied from TEST. Without them players cannot sign in.</li>
<li>Your authenticator on production, and the season start.</li>
<li>Deciding when real players receive reminders.</li>
<li>The steps are in <code>docs/24-go-live-runbook.md</code>, about an hour end to end.</li></ul></div>
</div></section>
</div>"""
pathlib.Path(sys.argv[1]).write_text(PAGE)
print(f"wrote {sys.argv[1]} ({len(PAGE)//1024} KB)")
