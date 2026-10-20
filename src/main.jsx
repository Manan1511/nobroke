import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import "./index.css"
import App from "./App"
import Landing from "@/landing/Landing"
import { StoreProvider } from "@/lib/store"
import { TooltipProvider } from "@/components/ui/tooltip"

// "/" = landing page, "/app/..." = the NoBroke app (each section has its own address).
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <StoreProvider>
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app/:section?" element={<App />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </StoreProvider>
  </StrictMode>
)
