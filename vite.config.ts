import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

/**
 * Serve the app shell for deep links in dev, the way vercel.json rewrites do
 * in production. Without it a fresh load of /s/CODE gets the landing page and
 * every shared invite is broken.
 */
const deepLinks = (): Plugin => ({
  name: "hissa-deep-links",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      // /s/CODE is the deep link; /app is what vercel.json rewrites it to,
      // and in dev only app.html exists on disk.
      if (req.url && /^\/(s\/[^/?#]+|app)(\/|\?|$)/.test(req.url)) req.url = "/app.html";
      next();
    });
  },
});

export default defineConfig({
  plugins: [
    deepLinks(),
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
        // Workbox matches pathname + search, so "/?about" needs its own allowance
        // or the service worker answers the landing page with the app shell.
        navigateFallbackDenylist: [/^\/(\?.*)?$/, /^\/how-it-works/, /^\/api\//],
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
