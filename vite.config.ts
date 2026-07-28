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
  build: {
    rollupOptions: {
      // Four HTML entries, one shared bundle: "/" = photo read, "/loop" = quiz,
      // "/account" = the balance screen sign-in links come back to,
      // "/tests" = the psychological tests.
      input: {
        main: "index.html",
        loop: "loop/index.html",
        account: "account/index.html",
        tests: "tests/index.html",
      },
    },
  },
});
