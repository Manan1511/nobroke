import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from "react-router"
import "./index.css"
import App from "./App"
import Landing from "@/landing/Landing"
import { StoreProvider } from "@/lib/store"
import { TooltipProvider } from "@/components/ui/tooltip"
import ClickSpark from "@/components/bits/ClickSpark"

// "/" = landing page, "/app/..." = the NoBroke app (each section has its own address).
// The shareable single-page copy (npm run build:share) can't use real addresses, so it keeps them in memory.
const Router = import.meta.env.VITE_ROUTER === "memory" ? MemoryRouter : BrowserRouter

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <TooltipProvider>
        <Router>
          <ClickSpark sparkColor={["#ff4a1c", "#ffcf36", "#48c98d", "#2997da"]} sparkSize={9} sparkRadius={20} sparkCount={8} duration={450}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app/:section?" element={<App />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ClickSpark>
        </Router>
      </TooltipProvider>
    </StoreProvider>
  </StrictMode>
)
