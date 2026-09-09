import { useEffect, useState } from "react";

/** Version checks are public and never reload an active match or discard a typed score. */
export function AppUpdateNotice() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    let stopped = false;
    const script = document.querySelector<HTMLScriptElement>(
      'script[type="module"][src]',
    );
    if (!script) return;
    const running = new URL(script.src).pathname.split("/").at(-1);
    const check = async () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      try {
        const response = await fetch(
          `${import.meta.env.BASE_URL}app-version.json?check=1`,
          {
            cache: "no-store",
            credentials: "omit",
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!response.ok) return;
        const version: unknown = await response.json();
        if (
          !stopped &&
          version &&
          typeof version === "object" &&
          "entry" in version &&
          typeof version.entry === "string" &&
          /^index-[\w-]+\.js$/.test(version.entry)
        )
          setAvailable(version.entry !== running);
      } catch {
        /* Offline game data remains readable. */
      }
    };
    void check();
    const timer = setInterval(() => void check(), 60000);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return available ? (
    <aside className="app-update-notice" role="status">
      <strong>A newer version of Maplewood is ready.</strong>
      <span>Reload after saving your work. You’ll need to sign in again.</span>
      <button
        onClick={() => {
          if (
            window.confirm(
              "Reload the updated app? Unsaved changes will be lost and you’ll need to sign in again.",
            )
          )
            window.location.reload();
        }}
      >
        Reload updated app
      </button>
    </aside>
  ) : null;
}
