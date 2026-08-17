import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// PWA manifest/icons are intentionally minimal here. Full precache strategy
// (fonts, audio, art assets), the first-gesture audio-unlock screen, and
// real icon assets are built out in tasks.md Section 8 (P2 - Assessment
// game) and validated against the P0 iOS spikes (Section 2).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "shizi",
        short_name: "shizi",
        description: "识字 — help Eliana recognize Chinese characters",
        start_url: "/",
        display: "standalone",
        orientation: "landscape",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
      },
    }),
  ],
});
