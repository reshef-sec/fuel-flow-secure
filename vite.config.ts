import path from "path";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { componentTagger } from "lovable-tagger";
import { mockupPreviewPlugin } from "./mockupPreviewPlugin";
import tailwindcss from "@tailwindcss/vite";

// Always builds the static single-page app into dist/client; the Express server
// (server/index.js) serves it on Render together with the same-origin /api.
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Dev: forward API calls to `npm run dev:server` so cookies stay same-origin.
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: false },
    },
  },
  // Production is served by Express (`npm start` / `npm run preview` → server/index.js).
  // This only matters if someone runs `npm run preview:vite` on a Render host.
  preview: {
    host: "0.0.0.0",
    port: Number(process.env.PORT ?? 4173),
    allowedHosts: [".onrender.com"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    tailwindcss(),
    mockupPreviewPlugin(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({ spa: { enabled: true, prerender: { outputPath: "/index.html", crawlLinks: false } } }),
    viteReact(),
    ...(mode === "development" ? [componentTagger()] : []),
  ],
}));
