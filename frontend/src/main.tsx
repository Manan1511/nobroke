import { StrictMode, Suspense, lazy } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter, MemoryRouter, Route, Routes } from "react-router"
import "./index.css"
// Each area loads only when opened: the 3D landing, the app, and the 404 page are separate downloads.
const Landing = lazy(() => import("@/landing/Landing"))
const App = lazy(() => import("./App"))
const NotFound = lazy(() => import("@/pages/NotFound"))
const Loading = () => <div className="min-h-svh bg-background" aria-busy="true" />
import { StoreProvider } from "@/lib/store"
import { TooltipProvider } from "@/components/ui/tooltip"
import ClickSpark from "@/components/bits/ClickSpark"
import { AuthCallback, GroupInviteAcceptance, PasswordSetup } from "@/pages/AuthFlow"

// "/" = landing page, "/app/..." = the NoBroke app (each section has its own address).
// The shareable single-page copy (npm run build:share) can't use real addresses, so it keeps them in memory.
const Router = import.meta.env.VITE_ROUTER === "memory" ? MemoryRouter : BrowserRouter

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <TooltipProvider>
        <Router>
          <ClickSpark sparkColor="#ff4a1c" sparkSize={9} sparkRadius={20} sparkCount={8} duration={450}>
          <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/auth/reset" element={<PasswordSetup />} />
            <Route path="/auth/invite" element={<PasswordSetup />} />
            <Route path="/invite/:token" element={<GroupInviteAcceptance />} />
            <Route path="/app/:section?" element={<App />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ClickSpark>
        </Router>
      </TooltipProvider>
    </StoreProvider>
  </StrictMode>
)
