// The button census. Every control a person can see and use, on every page and tab, in several league states, is
// clicked and must do something: a save, a dialog, a new view, a download or share, a message, or a visible change.
// It must never throw a script error, and a control that is offered must not answer only that it is not available
// (the Call In defect: a visible button whose only response was "Start a session before…").
// census-discover.spec.ts records the controls in button-census-<project>.json; buttons.suite.ts makes every entry a
// test and fails when the page shows a control the census does not list, so a new button cannot go untested.
import type { Page } from "@playwright/test";
import type { GenOpts } from "./gen";

export type Role = "organizer" | "player";
export type State = { id: string; role: Role; seed: number; opts: GenOpts };
export const PLAYER_EMAIL = "census.player@example.invalid";
export const STATES: State[] = [
  { id: "pre-session", role: "organizer", seed: 53001, opts: { regulars: 22, spares: 3, pending: 2, live: "none", sessions: 3, hoursBefore: 60 } },
  { id: "first-night", role: "organizer", seed: 53002, opts: { regulars: 14, spares: 2, pending: 3, live: "none", sessions: 0, hoursBefore: 100 } },
  { id: "round-1", role: "organizer", seed: 53003, opts: { regulars: 20, spares: 3, pending: 1, live: "r1-partial", sessions: 2 } },
  { id: "round-2", role: "organizer", seed: 53004, opts: { regulars: 18, spares: 2, pending: 0, live: "r2-partial", sessions: 4 } },
  { id: "complete", role: "organizer", seed: 53005, opts: { regulars: 16, spares: 2, pending: 0, live: "complete", sessions: 5 } },
  { id: "player-before", role: "player", seed: 53006, opts: { regulars: 16, spares: 2, pending: 0, live: "none", sessions: 3, hoursBefore: 60, viewerEmail: PLAYER_EMAIL, viewerKind: "regular" } },
  { id: "player-live", role: "player", seed: 53007, opts: { regulars: 16, spares: 2, pending: 0, live: "r1-partial", sessions: 3, viewerEmail: PLAYER_EMAIL, viewerKind: "regular" } },
  // Variety: league sizes, spares, the season's progress, the pause between rounds, and a spare's own view.
  { id: "big-before", role: "organizer", seed: 53011, opts: { regulars: 28, spares: 4, pending: 2, live: "none", sessions: 6, hoursBefore: 30 } },
  { id: "small-before", role: "organizer", seed: 53012, opts: { regulars: 6, spares: 1, pending: 0, live: "none", sessions: 1, hoursBefore: 80 } },
  { id: "spares-before", role: "organizer", seed: 53013, opts: { regulars: 12, spares: 6, pending: 1, live: "none", sessions: 2, hoursBefore: 50 } },
  { id: "late-season", role: "organizer", seed: 53014, opts: { regulars: 20, spares: 3, pending: 0, live: "none", sessions: 20, hoursBefore: 40 } },
  { id: "between-rounds", role: "organizer", seed: 53015, opts: { regulars: 18, spares: 2, pending: 0, live: "r1-done", sessions: 3, tieRate: 0 } },
  { id: "round-1-small", role: "organizer", seed: 53016, opts: { regulars: 8, spares: 1, pending: 0, live: "r1-partial", sessions: 1 } },
  { id: "round-1-big", role: "organizer", seed: 53017, opts: { regulars: 28, spares: 4, pending: 1, live: "r1-partial", sessions: 5 } },
  { id: "round-2-big", role: "organizer", seed: 53018, opts: { regulars: 26, spares: 3, pending: 0, live: "r2-partial", sessions: 7 } },
  { id: "complete-small", role: "organizer", seed: 53019, opts: { regulars: 8, spares: 1, pending: 0, live: "complete", sessions: 2 } },
  { id: "complete-big", role: "organizer", seed: 53020, opts: { regulars: 27, spares: 3, pending: 2, live: "complete", sessions: 9 } },
  { id: "player-round-2", role: "player", seed: 53021, opts: { regulars: 18, spares: 2, pending: 0, live: "r2-partial", sessions: 4, viewerEmail: PLAYER_EMAIL, viewerKind: "regular" } },
  { id: "spare-before", role: "player", seed: 53022, opts: { regulars: 14, spares: 3, pending: 0, live: "none", sessions: 3, hoursBefore: 50, viewerEmail: PLAYER_EMAIL, viewerKind: "spare" } },
  { id: "spare-live", role: "player", seed: 53023, opts: { regulars: 14, spares: 3, pending: 0, live: "r1-partial", sessions: 3, viewerEmail: PLAYER_EMAIL, viewerKind: "spare" } },
];

export type View = { id: string; roles: Role[]; scope: string; exclude?: string; open: (page: Page) => Promise<unknown> };
const both: Role[] = ["organizer", "player"];
const pageView = (p: string, roles: Role[] = both, exclude?: string): View => ({ id: p, roles, scope: `#page-${p}`, exclude, open: (page) => page.evaluate((x) => nav(x), p) });
const secView = (p: string, s: string, roles: Role[]): View => ({ id: `${p} → ${s}`, roles, scope: `#sec-${s}`, open: (page) => page.evaluate(([x, y]) => { nav(x); showSec(x, y); }, [p, s]) });
export const VIEWS: View[] = [
  pageView("home"), pageView("courts"), pageView("schedule"), pageView("register"),
  { id: "scores", roles: both, scope: "#page-scores", open: async (page) => {
    await page.evaluate(() => nav("scores"));
    const c = await page.evaluate(() => [1, 2, 3, 4, 5, 6].find((x) => (S.current?.assignments?.[x] || []).length >= 2) || 0);
    if (c) await page.locator("#sc-sel").selectOption(String(c));
  } },
  pageView("standings", both, "[id^='sec-']"),
  ...["lb", "rank", "pstats", "heat", "sessstand", "hist", "vote", "qa"].map((s) => secView("standings", s, both)),
  pageView("admin", ["organizer"], "[id^='sec-']"),
  ...["a-pl", "a-reg", "a-past", "a-wv", "a-sess", "a-att", "a-assign", "a-pay", "a-ann", "a-tools"].map((s) => secView("admin", s, ["organizer"])),
];

export type Control = { key: string; label: string; tag: string };
export type Entry = Control & { state: string; view: string };

/** The usable controls inside a view, one per kind (runs in the page; self-contained). With markKey, the first control
 *  of that kind is marked data-census-target so the test can act on it. */
export function pageControls(arg: { scope: string; exclude?: string; markKey?: string }) {
  document.querySelectorAll("[data-census-target]").forEach((e) => e.removeAttribute("data-census-target"));
  const root = document.querySelector(arg.scope);
  if (!root) return [] as { key: string; label: string; tag: string }[];
  const norm = (x: string) => x.replace(/\d+(\.\d+)?/g, "#").replace(/'[^']*@[^']*'/g, "'@'").replace(/\s+/g, " ").trim();
  const els = [...root.querySelectorAll("button, select, a[href], [onclick], [role=button], input[type=checkbox], input[type=radio], summary")] as HTMLElement[];
  const seen = new Set<string>(), out: { key: string; label: string; tag: string }[] = [];
  for (const el of els) {
    if (el.closest("#modal") || (arg.exclude && el.closest(arg.exclude))) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.pointerEvents === "none") continue;
    if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true" || el.closest("[inert], fieldset[disabled]")) continue;
    if (el.tagName === "SELECT" && (el as HTMLSelectElement).options.length < 2) continue;   // one option: no choice to make
    const h = el.getAttribute("onclick") || el.getAttribute("onchange") || "";
    const label = norm((el.getAttribute("aria-label") || el.textContent || el.getAttribute("title") || (el as HTMLInputElement).name || "").slice(0, 70));
    const tag = el.tagName.toLowerCase() + (el.getAttribute("type") ? ":" + el.getAttribute("type") : "");
    const key = `${tag}|${h ? norm(h) : el.id ? "#" + norm(el.id) : "label:" + label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (arg.markKey === key) el.setAttribute("data-census-target", "1");
    out.push({ key, label, tag });
  }
  return out;
}

/** What the page looks like now, for telling whether a control did anything (runs in the page). */
export function pageSnapshot(scope: string) {
  const vis = (e: Element) => { const r = (e as HTMLElement).getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const root = document.querySelector(scope), s = root ? root.innerHTML : "";
  // Field values and ticks are not part of the HTML but are a visible change too ("Use current fees" fills fields).
  const vals = root ? [...root.querySelectorAll("input, select, textarea")].map((e) => { const f = e as HTMLInputElement; return f.type === "checkbox" || f.type === "radio" ? (f.checked ? "1" : "0") : f.value; }).join("\u0001") : "";
  let h = 0;
  for (const x of [s, vals]) for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0;
  const t = document.getElementById("_t");
  return {
    page: [...document.querySelectorAll(".page")].filter(vis).map((e) => e.id).join(","),
    secs: [...document.querySelectorAll("[id^='sec-']")].filter(vis).map((e) => e.id).join(","),
    hash: location.hash, modal: !!document.querySelector("#modal.open"), modalTitle: document.getElementById("modal-title")?.textContent || "",
    toast: t && getComputedStyle(t).opacity !== "0" ? (t.textContent || "") : "", toastRaw: t?.textContent || "",
    calls: ((window as unknown as { __census?: { calls: string[] } }).__census?.calls || []).length, dom: h, scroll: Math.round(window.scrollY),
    focus: (document.activeElement as HTMLElement | null)?.id || "",
  };
}

/** Stand-ins for everything that would leave the page: new windows, downloads, the clipboard, sharing and printing. */
export function installStubs() {
  const w = window as unknown as Record<string, unknown> & { __census?: { calls: string[] } };
  if (w.__census) { w.__census.calls.length = 0; return; }
  const calls: string[] = [];
  w.__census = { calls };   // cleared in place for each case, so the stand-ins below keep recording into it
  w.open = (u: string) => { calls.push("open:" + u); return null; };
  const oc = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b: Blob | MediaSource) => { calls.push("blob"); return oc(b); };
  try { Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { calls.push("clipboard"); }, readText: async () => "" }, configurable: true }); } catch { /* read-only in some builds */ }
  (navigator as unknown as { share: unknown }).share = async () => { calls.push("share"); };
  w.print = () => { calls.push("print"); };
  const ac = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    if (this.download || this.href.startsWith("blob:") || this.href.startsWith("data:")) { calls.push("download"); return; }
    return ac.call(this);
  };
  if (typeof w.downloadText === "function") w.downloadText = () => { calls.push("downloadText"); };
}

/** Messages that mean "this control is offered but not available here": a visible, enabled control must not answer
 *  only with one of these (it should be hidden, disabled, or do the right thing for this state). */
export const UNAVAILABLE = /^(⚠️ ?)?(Start a session before|Start an unfinished session|No active session|Nothing to undo|Session already active|Organizer verification required)/i;
