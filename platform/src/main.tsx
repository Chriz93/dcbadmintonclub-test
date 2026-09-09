import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
const demo =
  new URLSearchParams(window.location.search).get("demo") === "game-day";
// The synthetic tour never imports the connected app or its authentication client.
const App = React.lazy(() =>
  demo ? import("./demo/GameDayDemo") : import("./App"),
);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <React.Suspense fallback={<p role="status">Opening Maplewood…</p>}>
      <App />
    </React.Suspense>
  </React.StrictMode>,
);
if (!demo && import.meta.env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("./sw.js").catch(() => {
    /* App remains usable without installation. */
  });
