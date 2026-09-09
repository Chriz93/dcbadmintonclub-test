import { useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
const clubSchema = z.object({
  name: z.string(),
  revision: z.number(),
  settings: z.record(z.string(), z.unknown()),
});
const announcementSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  public: z.boolean(),
  revision: z.number(),
});
export function ClubSetup({ club }: { club: string }) {
  const [record, setRecord] = useState<z.infer<typeof clubSchema> | null>(null),
    [announcements, setAnnouncements] = useState<
      z.infer<typeof announcementSchema>[]
    >([]),
    [loaded, setLoaded] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState<string>("");
  async function load() {
    if (!supabase) return;
    setBusy(true);
    setLoaded("");
    try {
      const [c, a] = await Promise.all([
        supabase
          .from("clubs")
          .select("name,revision,settings")
          .eq("id", club)
          .single(),
        supabase
          .from("announcements")
          .select("id,title,body,public,revision")
          .eq("club_id", club)
          .order("updated_at", { ascending: false }),
      ]);
      if (c.error || a.error) throw new Error();
      setRecord(clubSchema.parse(c.data));
      setAnnouncements(z.array(announcementSchema).parse(a.data));
      setLoaded(club);
      setMessage("Settings loaded.");
    } catch {
      setMessage(
        "Settings could not be loaded. Check administrator verification.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(rpc: string, args: Record<string, unknown>) {
    if (!supabase) return;
    setBusy(true);
    try {
      const r = await supabase.rpc(rpc, args);
      if (r.error) throw r.error;
      setMessage(
        rpc === "create_season"
          ? "Season and courts created. Refresh the administration screen, then import its reviewed permit."
          : "Saved. Reload settings to see the current revision.",
      );
      setLoaded("");
    } catch (e) {
      setMessage(
        `Not saved: ${(e as { message?: string }).message ?? "refresh before retrying"}`,
      );
    } finally {
      setBusy(false);
    }
  }
  const selected = announcements.find((a) => a.id === editing);
  return (
    <details>
      <summary>Club settings, season builder and announcements</summary>
      <button
        className="button"
        disabled={busy || !navigator.onLine}
        onClick={() => void load()}
      >
        Load club setup
      </button>
      {loaded === club && record && (
        <>
          <form
            key={`club/${record.revision}`}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void save("save_club_settings", {
                c: club,
                expected_revision: record.revision,
                club_name: f.get("clubName"),
                contact_email: f.get("contact"),
                accent: f.get("accent"),
                reason: f.get("reason"),
              });
            }}
          >
            <h3>Public club details</h3>
            <label>
              Club display name
              <input
                name="clubName"
                required
                minLength={2}
                maxLength={100}
                defaultValue={record.name}
              />
            </label>
            <label>
              Public contact email
              <input
                name="contact"
                type="email"
                required
                maxLength={254}
                defaultValue={String(record.settings.contactEmail ?? "")}
              />
            </label>
            <label>
              Club accent colour
              <input
                name="accent"
                type="color"
                defaultValue={String(record.settings.accent ?? "#146b4c")}
              />
            </label>
            <label>
              Settings change reason
              <input name="reason" required minLength={5} maxLength={500} />
            </label>
            <button className="button" disabled={busy || !navigator.onLine}>
              Save public club details
            </button>
          </form>
          <details>
            <summary>Create a season and venue</summary>
            <p>
              This creates an empty season. Import a reviewed permit afterward
              to add session dates. Existing bookings and results remain in
              their original season.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void save("create_season", {
                  c: club,
                  season_name: f.get("seasonName"),
                  venue_name: f.get("venueName"),
                  address: f.get("address"),
                  rooms: f.get("rooms"),
                  court_count: Number(f.get("courts")),
                  regular_capacity: Number(f.get("regulars")),
                  spare_capacity: Number(f.get("spares")),
                  waitlist_capacity: Number(f.get("waitlist")),
                  timezone: f.get("timezone"),
                  normal_target: Number(f.get("normal")),
                  five_target: Number(f.get("five")),
                  reason: f.get("reason"),
                });
              }}
            >
              <label>
                Season name
                <input
                  name="seasonName"
                  required
                  minLength={2}
                  maxLength={150}
                />
              </label>
              <label>
                Venue name
                <input
                  name="venueName"
                  required
                  minLength={2}
                  maxLength={150}
                />
              </label>
              <label>
                Venue address
                <input name="address" required minLength={3} maxLength={500} />
              </label>
              <label>
                Booked rooms
                <input name="rooms" required maxLength={200} />
              </label>
              <label>
                Time zone
                <input
                  name="timezone"
                  required
                  defaultValue="America/Toronto"
                />
              </label>
              {(
                [
                  ["courts", "Number of courts", 6, 1, 50],
                  ["regulars", "Regular places", 25, 1, 250],
                  ["spares", "Spare roster capacity", 25, 0, 250],
                  ["waitlist", "Waitlist capacity", 25, 0, 250],
                  ["normal", "Standard target score", 21, 1, 99],
                  ["five", "Five-player target score", 15, 1, 99],
                ] as const
              ).map(([name, label, value, min, max]) => (
                <label key={name}>
                  {label}
                  <input
                    name={name}
                    type="number"
                    required
                    min={min}
                    max={max}
                    defaultValue={value}
                  />
                </label>
              ))}
              <label>
                Season creation reason
                <input name="reason" required minLength={5} maxLength={500} />
              </label>
              <button className="button" disabled={busy || !navigator.onLine}>
                Create empty season and courts
              </button>
            </form>
          </details>
          <details>
            <summary>Manage announcements</summary>
            <p>
              Announcements appear in the app. Saving one does not send email or
              SMS.
            </p>
            <label>
              Announcement to edit
              <select
                value={editing}
                onChange={(e) => setEditing(e.target.value)}
              >
                <option value="">New announcement</option>
                {announcements.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
            <form
              key={`${editing}/${selected?.revision ?? 0}`}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void save("save_announcement", {
                  c: club,
                  entry: selected?.id ?? null,
                  expected_revision: selected?.revision ?? 0,
                  title: f.get("title"),
                  body: f.get("body"),
                  is_public: f.get("public") === "on",
                  remove: false,
                  reason: f.get("reason"),
                });
              }}
            >
              <label>
                Announcement title
                <input
                  name="title"
                  required
                  minLength={2}
                  maxLength={150}
                  defaultValue={selected?.title ?? ""}
                />
              </label>
              <label>
                Announcement text
                <textarea
                  name="body"
                  required
                  minLength={2}
                  maxLength={5000}
                  rows={5}
                  defaultValue={selected?.body ?? ""}
                />
              </label>
              <label className="check-label">
                <input
                  name="public"
                  type="checkbox"
                  defaultChecked={selected?.public ?? false}
                />
                Visible to public visitors (otherwise members only)
              </label>
              <label>
                Announcement change reason
                <input name="reason" required minLength={5} maxLength={500} />
              </label>
              <button className="button" disabled={busy || !navigator.onLine}>
                Save announcement
              </button>
              {selected && (
                <button
                  className="button"
                  type="button"
                  disabled={busy || !navigator.onLine}
                  onClick={() => {
                    const reason = window.prompt(
                      "Reason for removing this announcement:",
                    );
                    if (reason && reason.trim().length >= 5)
                      void save("save_announcement", {
                        c: club,
                        entry: selected.id,
                        expected_revision: selected.revision,
                        title: selected.title,
                        body: selected.body,
                        is_public: selected.public,
                        remove: true,
                        reason,
                      });
                  }}
                >
                  Remove announcement
                </button>
              )}
            </form>
          </details>
        </>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
