import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Two funnels share one bundle: the photo read owns "/", the original quiz
// lives at /loop. Old quiz deep links (?s=<id>) landed on the root — the query
// wins over the pathname so those emails keep opening the quiz.
const isQuiz =
  window.location.pathname.startsWith("/loop") ||
  new URLSearchParams(window.location.search).has("s");

const App = lazy(() => (isQuiz ? import("./App") : import("./photo/PhotoApp")));

// Mirrors the static skeleton in index.html so the lazy chunk swap is seamless.
function Skeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <span className="pulse-soft font-display text-[13px] tracking-[0.42em] text-paper">
        LOOPLORE
      </span>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={<Skeleton />}>
      <App />
    </Suspense>
  </StrictMode>,
);
