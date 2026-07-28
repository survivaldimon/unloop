import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Three funnels and one account screen share this bundle: the photo read owns
// "/", the original quiz lives at /loop, the psychological tests at /tests,
// /account is where sign-in links and password resets come back to. Old quiz
// deep links (?s=<id>) landed on the root — the query wins over the pathname
// so those emails keep opening the quiz, but never at the expense of /account,
// which auth links point straight at and which must win outright.
const path = window.location.pathname;
const isAccount = path.startsWith("/account");
const isQuiz =
  !isAccount &&
  (path.startsWith("/loop") || new URLSearchParams(window.location.search).has("s"));
const isTests = !isAccount && !isQuiz && path.startsWith("/tests");

const App = lazy(() =>
  isAccount
    ? import("./account/AccountApp")
    : isQuiz
      ? import("./App")
      : isTests
        ? import("./tests/TestsApp")
        : import("./photo/PhotoApp"),
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
