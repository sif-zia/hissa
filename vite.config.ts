import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    preact(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      // Only the app shell is precached. The landing pages are static HTML that
      // the CDN already serves fast, and precaching them would ship the SEO
      // surface into every installed app for no gain.
      includeAssets: ["favicon.svg", "icons/*.png", "fonts/*.woff2"],
      manifest: {
        name: "Hissa — split a bill",
        short_name: "Hissa",
        description: "Photograph a bill, tap what you ate, everyone sees their hissa.",
        start_url: "/app.html",
        scope: "/",
        display: "standalone",
        background_color: "#f3ecda",
        theme_color: "#f3ecda",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,woff2}", "app.html"],
        navigateFallback: "/app.html",
        navigateFallbackDenylist: [/^\/$/, /^\/how-it-works/, /^\/api\//],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, "index.html"),
        how: resolve(__dirname, "how-it-works.html"),
        app: resolve(__dirname, "app.html"),
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
