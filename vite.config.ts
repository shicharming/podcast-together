import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from "path"
import { VitePWA } from 'vite-plugin-pwa'
import mkcert from 'vite-plugin-mkcert'
const { version } = require("./package.json")

const projectRoot = __dirname

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProduction = mode === "production"
  return {
    plugins: [
      vue(),

      mkcert(),
      
      VitePWA({
        registerType: "autoUpdate",
        manifest: false,
        devOptions: {
          enabled: true,
          type: 'module'
        },
        includeAssets: [
          "apple-touch-icon.png", 
          "favicon-32x32.png", 
          "favicon-16x16.png", 
          "safari-pinned-tab.svg"
        ]
      })
    ],
    server: {
      host: "0.0.0.0",
      // Dev-only: proxy /pt-api/* to the local wrangler dev backend so the
      // https frontend talks to it same-origin (no mixed-content / CORS).
      // Set VITE_API_URL=/pt-api and VITE_WEBSOCKET_URL=/pt-api/ws in .env.local.
      proxy: {
        "/pt-api": {
          target: "http://127.0.0.1:8787",
          changeOrigin: true,
          ws: true,
          rewrite: (p) => p.replace(/^\/pt-api/, ""),
        },
      },
    },
    resolve: {
      alias: {
        "@": resolve(projectRoot, "src"),
      }
    },
    esbuild: isProduction ? {
      drop: ["console", "debugger"]
    } : undefined,
    define: {
      "PT_ENV": {
        "version": version,
        "client": "web"
      }
    }
  }
})
