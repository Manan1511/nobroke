import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from "react-router"
import "./index.css"
import App from "./App"
import Landing from "@/landing/Landing"
import { StoreProvider } from "@/lib/store"
import { TooltipProvider } from "@/components/ui/tooltip"

// "/" = landing page, "/app/..." = the NoBroke app (each section has its own address).
// The shareable single-page copy (npm run build:share) can't use real addresses, so it keeps them in memory.
const Router = import.meta.env.VITE_ROUTER === "memory" ? MemoryRouter : BrowserRouter

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <StoreProvider>
      <TooltipProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app/:section?" element={<App />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </TooltipProvider>
    </StoreProvider>
  </StrictMode>
)
