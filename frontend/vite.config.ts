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
    : {},
}))
