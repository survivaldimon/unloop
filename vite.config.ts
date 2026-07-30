import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base: "/" — the site is served from the domain root (looplore.app); the /loop
// entry needs absolute asset URLs, a relative base would resolve them under /loop/.
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  server: {
    // Honor the harness-assigned port when launched via .claude/launch.json.
    port: Number(process.env.PORT) || 5173,
  },
  preview: {
    // Same deal for `vite preview`, so parallel worktree sessions don't fight
    // over 4173.
    port: Number(process.env.PORT) || 4173,
  },
  build: {
    rollupOptions: {
      // Five HTML entries, one shared bundle: "/" = the tests catalogue (also
      // reachable at /tests, which the per-test OG pages live under), "/photo"
      // = the photo read, "/loop" = quiz, "/account" = the balance screen
      // sign-in links come back to.
      input: {
        main: "index.html",
        photo: "photo/index.html",
        loop: "loop/index.html",
        tests: "tests/index.html",
        account: "account/index.html",
      },
    },
  },
});
