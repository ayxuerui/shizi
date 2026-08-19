import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Task 8.1: real precache strategy (font subset, placeholder audio/art,
// real manifest icons — see public/fonts, public/audio, public/icons and
// their PROVENANCE — none of the icons/audio are final assets yet, but
// they are real, committed files, not empty stubs, so the PWA install
// experience and offline precache are genuinely exercisable now).
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
        background_color: "#fff8ee", // matches styles/tokens.css's --color-bg
        theme_color: "#fff8ee",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // OFL.txt/subset-manifest.json ("txt"/"json") are precached
        // alongside the font they document — a served-but-not-precached
        // license file would defeat the point of shipping it for
        // offline use. "wav" covers the placeholder audio clips.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,wav,txt,json}"],
      },
    }),
  ],
});
