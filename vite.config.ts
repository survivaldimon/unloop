import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base: "./" so the build works from a GitHub Pages subpath
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
