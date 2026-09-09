import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "../services/auth";
import { snapshotSchema, type LeagueData } from "./data";
const choicesSchema = z.array(
  z.object({ id: z.string(), club_id: z.string(), name: z.string() }),
);
export function useLeague(userId: string) {
  const [choices, setChoices] = useState<z.infer<typeof choicesSchema>>([]),
    [season, setSeason] = useState(""),
    [data, setData] = useState<LeagueData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [fresh, setFresh] = useState(false),
    [changed, setChanged] = useState(false),
    [checkedAt, setCheckedAt] = useState<Date | null>(null),
    [admin, setAdmin] = useState(false),
    [editEpoch, setEditEpoch] = useState(0),
    [boot, setBoot] = useState(0),
    [loaded, setLoaded] = useState(false);
  const version = useRef<string | null>(null),
    dirty = useRef(new Set<string>()),
    pending = useRef<LeagueData | null>(null),
    generation = useRef(0),
    request = useRef<AbortController | null>(null);
  const choice = choices.find((s) => s.id === season);
  useEffect(() => {
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 12000);
    setLoaded(false);
    void supabase!
      .from("seasons")
      .select("id,club_id,name")
      .order("name")
      .abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted) {
          setError("Season lookup timed out. Please retry.");
          return;
        }
        try {
          if (error) throw error;
          const rows = choicesSchema.parse(data);
          setChoices(rows);
          setSeason((current) =>
            rows.some((s) => s.id === current)
              ? current
              : (rows.at(-1)?.id ?? ""),
          );
          setError("");
          setLoaded(true);
        } catch {
          setError("Unable to load seasons. Retry when connected.");
        } finally {
          clearTimeout(timeout);
        }
      });
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [userId, boot]);
  const refresh = useCallback(
    async (force = false) => {
      if (!choice || !supabase) {
        if (force) setBoot((n) => n + 1);
        return;
      }
      if (request.current) {
        if (!force) return;
        request.current.abort();
      }
      const controller = new AbortController();
      request.current = controller;
      const current = generation.current;
      const timeout = setTimeout(() => controller.abort(), 12000);
      if (force) setBusy(true);
      try {
        const [result, access] = await Promise.all([
          supabase
            .rpc("league_snapshot", {
              c: choice.club_id,
              se: choice.id,
              known_version: force ? null : version.current,
            })
            .abortSignal(controller.signal),
          supabase
            .rpc("is_admin", { c: choice.club_id })
            .abortSignal(controller.signal),
        ]);
        if (current !== generation.current || request.current !== controller)
          return;
        if (
          result.error ||
          !result.data ||
          typeof result.data.version !== "string"
        )
          throw new Error();
        setAdmin(!access.error && access.data === true);
        if (result.data.unchanged !== true) {
          const next = snapshotSchema.parse(result.data);
          if (dirty.current.size) {
            pending.current = next;
            setChanged(true);
          } else {
            setData(next);
            version.current = next.version;
            setChanged(false);
            pending.current = null;
          }
        }
        setError("");
        setFresh(true);
        setCheckedAt(new Date());
      } catch {
        if (current === generation.current && request.current === controller) {
          setError(
            "Live results could not be refreshed. Reconnect and retry before saving.",
          );
          setFresh(false);
        }
      } finally {
        clearTimeout(timeout);
        if (request.current === controller) {
          request.current = null;
          setBusy(false);
        }
      }
    },
    [choice],
  );
  useEffect(() => {
    generation.current++;
    request.current?.abort();
    request.current = null;
    version.current = null;
    dirty.current.clear();
    pending.current = null;
    setData(null);
    setFresh(false);
    setChanged(false);
    setAdmin(false);
    const timer = window.setTimeout(() => {
        if (choice) void refresh(true);
      }, 0),
      interval = window.setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, 15000);
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const offline = () => setFresh(false);
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("online", visible);
    window.addEventListener("offline", offline);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("visibilitychange", visible);
    return () => {
      generation.current++;
      request.current?.abort();
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("online", visible);
      window.removeEventListener("offline", offline);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, choice]);
  const markDirty = useCallback((id: string, value: boolean) => {
    if (value) dirty.current.add(id);
    else dirty.current.delete(id);
  }, []);
  const acceptUpdates = () => {
    if (pending.current) {
      setData(pending.current);
      version.current = pending.current.version;
      pending.current = null;
    }
    dirty.current.clear();
    setChanged(false);
    setEditEpoch((n) => n + 1);
    void refresh(true);
  };
  const canLeave = useCallback(() => {
    if (!dirty.current.size) return true;
    if (!window.confirm("Discard your unsaved score edits?")) return false;
    dirty.current.clear();
    if (pending.current) {
      setData(pending.current);
      version.current = pending.current.version;
      pending.current = null;
    }
    setChanged(false);
    setEditEpoch((n) => n + 1);
    return true;
  }, []);
  return {
    choices,
    season,
    setSeason,
    data,
    error,
    busy,
    fresh,
    changed,
    checkedAt,
    admin,
    club: choice?.club_id ?? "",
    refresh,
    markDirty,
    acceptUpdates,
    canLeave,
    editEpoch,
    loaded,
  };
}
