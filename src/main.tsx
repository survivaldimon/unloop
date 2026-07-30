import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Three funnels and one account screen share this bundle: the tests own "/"
// (and keep answering at /tests, where the per-test OG pages live), the photo
// read is at /photo, the original quiz at /loop, /account is where sign-in
// links and password resets come back to. Queries from old emails win over the
// pathname: quiz deep links (?s=<id>) and photo deep links (?p=<id>) both
// landed on the root back when it was theirs, so those emails keep opening
// their funnel — but never at the expense of /account, which auth links point
// straight at and which must win outright.
const path = window.location.pathname;
const params = new URLSearchParams(window.location.search);
const isAccount = path.startsWith("/account");
const isQuiz = !isAccount && (path.startsWith("/loop") || params.has("s"));
const isPhoto = !isAccount && !isQuiz && (path.startsWith("/photo") || params.has("p"));

const App = lazy(() =>
  isAccount
    ? import("./account/AccountApp")
    : isQuiz
      ? import("./App")
      : isPhoto
        ? import("./photo/PhotoApp")
        : import("./tests/TestsApp"),
);

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
