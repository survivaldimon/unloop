import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base: "./" so the build works from a GitHub Pages subpath
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    // Honor the harness-assigned port when launched via .claude/launch.json.
    port: Number(process.env.PORT) || 5173,
  },
});
