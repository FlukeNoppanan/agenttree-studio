import path from "node:path"
import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(directory, "./src"),
    },
  },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.AGENTTREE_STUDIO_API_PROXY_TARGET || "http://127.0.0.1:8000",
        // Keep the browser-facing Host so backend same-origin CSRF checks work
        // for localhost and LAN-IP access without accepting arbitrary origins.
        changeOrigin: false,
      },
    },
  },
})
