import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Task 8.1: real precache strategy (font subset, placeholder audio/art,
// real manifest icons — see public/fonts, public/audio, public/icons and
// their PROVENANCE — none of the icons/audio are final assets yet, but
// they are real, committed files, not empty stubs, so the PWA install
// experience and offline precache are genuinely exercisable now).
// Served at shizi.realxco.com/assessment/ (infra/nginx-assessment.conf) so
// the same nginx container/tunnel target can host other apps at other path
// prefixes later — see design.md's "single holding service" decision. `base`
// must match that prefix exactly; dev/preview then also serve from
// /assessment/, matching prod instead of diverging from it.
export default defineConfig(({ mode }) => {
  // add-dev-deployment: VITE_APP_ENV, not Vite's own `mode`, is the
  // environment signal — `vite build --mode dev` still produces a
  // NODE_ENV=production build (Vite only special-cases the literal mode
  // "development"), so keying behavior off `mode` would invite exactly
  // the "dev build" vs "development build" confusion this is trying to
  // avoid. `mode` is only used here to pick which `.env.<mode>` file
  // loadEnv reads.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const isDev = env.VITE_APP_ENV === "dev";
  return {
    base: "/assessment/",
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          // Distinguishable home-screen names/icons when both builds are
          // installed on the same device (specs/deployment/spec.md's
          // "Deployed builds declare their environment") — the second
          // half of that requirement, an in-app badge, lives in
          // src/components/EnvBadge.tsx, rendered from AudioUnlockGate and
          // DiagnosticsScreen only.
          name: isDev ? "shizi dev" : "shizi",
          short_name: isDev ? "shizi dev" : "shizi",
          description: "识字 — help Eliana recognize Chinese characters",
          // Relative (no leading slash): manifest fields resolve relative to
          // the manifest's own URL, which itself is served under /assessment/.
          start_url: ".",
          scope: ".",
          display: "standalone",
          orientation: "landscape",
          background_color: "#fff8ee", // matches styles/tokens.css's --color-bg
          theme_color: "#fff8ee",
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "icons/maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
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
  };
});
