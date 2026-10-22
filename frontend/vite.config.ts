import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  // The share copy (npm run build:share) is packed into one HTML page, so it must be a single JS + CSS file.
  build: mode === "share"
    ? { cssCodeSplit: false, rollupOptions: { output: { inlineDynamicImports: true } } }
    : {
        rollupOptions: {
          output: {
            manualChunks(id) {
              const path = id.replaceAll("\\", "/")
              if (!path.includes("/node_modules/")) return
              if (path.includes("/node_modules/three/")) return "vendor-three"
              if (path.includes("/node_modules/gsap/")) return "vendor-gsap"
              if (path.includes("/node_modules/recharts/") || /\/node_modules\/d3-[^/]+\//.test(path)) return "vendor-charts"
              if (path.includes("/node_modules/@supabase/")) return "vendor-supabase"
              if (/\/node_modules\/(react|react-dom|scheduler|react-router)\//.test(path)) return "vendor-react"
              if (path.includes("/node_modules/radix-ui/") || path.includes("/node_modules/@radix-ui/") || path.includes("/node_modules/cmdk/")) return "vendor-ui"
              if (path.includes("/node_modules/motion/")) return "vendor-motion"
              if (path.includes("/node_modules/date-fns/")) return "vendor-dates"
            },
          },
        },
      },
}))
