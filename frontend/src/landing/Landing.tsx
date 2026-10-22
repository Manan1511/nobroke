// NoBroke landing page (from nobroke-source), rendered inside the React app at "/".
// Links marked data-app-link open the app without a full page reload.
import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { AuthPanel, type AuthMode } from "./AuthPanel"
import { useSession } from "@/lib/session"
import { safePostLoginPath } from "@/lib/auth-navigation"
import "./landing.css"
import ShinyText from "@/components/bits/ShinyText"

export default function Landing() {
  const root = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const session = useSession()
  const [auth, setAuth] = useState<AuthMode | null>(null)
  const [next, setNext] = useState("/app") // where to go after logging in
  const signedIn = useRef(!!session)
  signedIn.current = !!session
  const closeAuth = useCallback(() => setAuth(null), [])

  useEffect(() => {
    if (!session && searchParams.get("auth") === "login") {
      setNext(safePostLoginPath(searchParams.get("next")))
      setAuth("login")
    }
  }, [searchParams, session])

  useEffect(() => {
    document.title = "NoBroke — Make moves. Unbound."
    const el = root.current
    if (!el) return
    const menuToggle = el.querySelector<HTMLButtonElement>("#menu-toggle")
    const menuPanel = el.querySelector<HTMLElement>("#site-menu")
    let menuOpen = false
    const setFallbackMenu = (open: boolean, moveFocus = false, returnFocus = false) => {
      if (!menuToggle || !menuPanel || menuOpen === open) return
      menuOpen = open
      menuToggle.classList.toggle("is-open", open)
      menuToggle.setAttribute("aria-expanded", String(open))
      menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation")
      menuPanel.setAttribute("aria-hidden", String(!open))
      menuPanel.inert = !open
      menuPanel.style.pointerEvents = open ? "auto" : "none"
      if (open && moveFocus) menuPanel.querySelector("a")?.focus({ preventScroll: true })
      if (!open && returnFocus) menuToggle.focus({ preventScroll: true })
    }
    const toggleFallbackMenu = () => setFallbackMenu(!menuOpen, !menuOpen)
    const onOutsidePointer = (event: PointerEvent) => {
      if (menuOpen && !menuPanel?.contains(event.target as Node) && !menuToggle?.contains(event.target as Node)) setFallbackMenu(false)
    }
    const onMenuKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menuOpen) { setFallbackMenu(false, false, true); return }
      if (event.key !== "Tab" || !menuOpen || !menuPanel) return
      const links = [...menuPanel.querySelectorAll<HTMLAnchorElement>("a[href]")]
      if (event.shiftKey && document.activeElement === links[0]) { event.preventDefault(); links.at(-1)?.focus({ preventScroll: true }) }
      else if (!event.shiftKey && document.activeElement === links.at(-1)) { event.preventDefault(); links[0]?.focus({ preventScroll: true }) }
    }
    const onMenuLink = (event: MouseEvent) => {
      if ((event.target as Element).closest("a[href]")) setFallbackMenu(false)
    }
    menuToggle?.addEventListener("click", toggleFallbackMenu)
    menuPanel?.addEventListener("click", onMenuLink)
    document.addEventListener("pointerdown", onOutsidePointer)
    document.addEventListener("keydown", onMenuKeydown)
    let sceneCleanup = () => {}
    let active = true
    void import("./scene").then(({ mountLanding }) => {
      if (!active) return
      if (menuOpen) setFallbackMenu(false)
      menuToggle?.removeEventListener("click", toggleFallbackMenu)
      menuPanel?.removeEventListener("click", onMenuLink)
      document.removeEventListener("pointerdown", onOutsidePointer)
      document.removeEventListener("keydown", onMenuKeydown)
      sceneCleanup = mountLanding(el, { animateIntro: false })
    }).catch(() => {
      // Static landing remains usable when optional WebGL effects cannot load.
    })
    const onClick = (e) => {
      const a = e.target.closest("a[data-app-link]")
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
      e.preventDefault()
      if (signedIn.current) navigate(a.getAttribute("href"))
      else { setNext(a.getAttribute("href")); setAuth("login") }
    }
    el.addEventListener("click", onClick)
    return () => {
      active = false
      el.removeEventListener("click", onClick)
      menuToggle?.removeEventListener("click", toggleFallbackMenu)
      menuPanel?.removeEventListener("click", onMenuLink)
      document.removeEventListener("pointerdown", onOutsidePointer)
      document.removeEventListener("keydown", onMenuKeydown)
      sceneCleanup()
    }
  }, [navigate])

  return (
    <div ref={root} className="nb-landing">
    <main className="page-shell">
      <section className="hero" id="hero" aria-label="NoBroke landing page hero">
        <canvas id="tube-scene" aria-hidden="true"></canvas>
        <header className="topbar" id="topbar">
          <a className="brand-mark" href="/" aria-label="NoBroke home">N</a>
          <button className="menu-toggle" id="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="site-menu">
            <span></span><span></span>
          </button>
          <nav className="menu-panel" id="site-menu" aria-label="Main navigation" aria-hidden="true" inert>
            <div className="menu-grid">
              <a href="/app" data-app-link>DASHBOARD</a>
              <a href="/app/groups" data-app-link>GROUPS</a>
              <a href="/app/expenses" data-app-link>EXPENSES</a>
              <a href="/app/balances" data-app-link>BALANCES</a>
              <a href="/app/settle-up" data-app-link>SETTLE UP</a>
              <a href="/app/pay-when-paid" data-app-link>PAY WHEN PAID</a>
              <a href="/app/recurring-bills" data-app-link>RECURRING BILLS</a>
              <a href="/app/friends" data-app-link>FRIENDS &amp; TRUST</a>
              <a href="/app/profile" data-app-link>PROFILE</a>
              <a className="menu-access" href="/app" data-app-link>{session ? "ENTER" : "LOG IN"}</a>
            </div>
          </nav>
        </header>

        <div className="floating-icons" aria-hidden="true">
          <div className="float-icon rocket-icon" data-icon="rocket" data-phase="0.72" data-period="4.6">
            <div className="icon-art rocket-art">
              <svg viewBox="0 0 120 140" role="presentation">
                <defs>
                  <linearGradient id="rocket-body" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#fffdf5"/><stop offset=".46" stopColor="#f4f0e8"/><stop offset="1" stopColor="#d8d1c8"/></linearGradient>
                  <linearGradient id="rocket-red" x1="0" x2="1"><stop stopColor="#ff7a50"/><stop offset="1" stopColor="#ed3213"/></linearGradient>
                  <radialGradient id="rocket-glass" cx="32%" cy="26%"><stop stopColor="#c8f7ff"/><stop offset=".5" stopColor="#51c6ed"/><stop offset="1" stopColor="#23799a"/></radialGradient>
                </defs>
                <ellipse cx="62" cy="129" rx="33" ry="6" fill="#5a3928" opacity=".12"/>
                <path d="M57 96 41 130l22-16 17 16-7-36" fill="url(#rocket-red)"/>
                <path d="M43 88 21 105l7-32 15-9M76 88l23 17-7-32-15-9" fill="url(#rocket-red)" stroke="#c73219" strokeWidth="2" strokeLinejoin="round"/>
                <path d="M60 10c-20 12-31 35-31 63v25c0 8 6 14 14 14h34c8 0 14-6 14-14V73c0-28-11-51-31-63Z" fill="url(#rocket-body)" stroke="#c8bfb5" strokeWidth="2"/>
                <path d="M60 9c-8 5-15 12-20 22h40C75 21 68 14 60 9Z" fill="url(#rocket-red)"/>
                <path d="M35 54h50" stroke="#d2c9be" strokeWidth="3"/>
                <circle cx="60" cy="64" r="14" fill="#d8edf0" stroke="#b6c5c5" strokeWidth="4"/>
                <circle cx="60" cy="64" r="10" fill="url(#rocket-glass)"/>
                <path d="M53 59c2-3 5-4 8-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".85"/>
              </svg>
            </div>
          </div>
          <div className="float-icon smile-icon" data-icon="smile" data-phase="2.4" data-period="5.4">
            <div className="icon-art smile-art">
              <svg viewBox="0 0 120 120" role="presentation">
                <defs><radialGradient id="smile-gold" cx="28%" cy="20%"><stop stopColor="#fff48a"/><stop offset=".55" stopColor="#ffcf36"/><stop offset="1" stopColor="#e89611"/></radialGradient></defs>
                <circle cx="60" cy="64" r="52" fill="#b9780a" opacity=".35" transform="translate(1 4)"/>
                <circle cx="60" cy="58" r="51" fill="url(#smile-gold)" stroke="#f4ad20" strokeWidth="3"/>
                <circle cx="41" cy="47" r="5.4" fill="#44240e"/>
                <path d="M74 47q12 3 21-3" fill="none" stroke="#44240e" strokeWidth="6" strokeLinecap="round"/>
                <path d="M38 68q21 26 48-1" fill="none" stroke="#75400e" strokeWidth="5" strokeLinecap="round"/>
                <path d="M27 32q7-10 17-12" fill="none" stroke="#fff9bb" strokeWidth="5" strokeLinecap="round" opacity=".72"/>
              </svg>
            </div>
          </div>
          <div className="float-icon wallet-icon" data-icon="wallet" data-phase="4.08" data-period="5.9">
            <div className="icon-art wallet-art">
              <svg viewBox="0 0 150 120" role="presentation">
                <defs><linearGradient id="wallet-blue" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#72d7ff"/><stop offset=".5" stopColor="#2997da"/><stop offset="1" stopColor="#1768aa"/></linearGradient><linearGradient id="wallet-flap" x1="0" x2="1"><stop stopColor="#48b6ec"/><stop offset="1" stopColor="#1778c5"/></linearGradient></defs>
                <path d="M23 35 39 19h77q10 0 10 10v7" fill="#e84c38" stroke="#aa352b" strokeWidth="3" strokeLinejoin="round"/>
                <path d="M22 38h100q8 0 8 8v49q0 9-10 9H23q-11 0-11-11V50q0-12 10-12Z" fill="url(#wallet-blue)" stroke="#175b91" strokeWidth="3"/>
                <path d="M83 52h42q11 0 11 10v19q0 9-11 9H82q-13 0-13-12v-13q0-13 14-13Z" fill="url(#wallet-flap)" stroke="#145b95" strokeWidth="3"/>
                <circle cx="98" cy="70" r="6" fill="#ffc84e" stroke="#ffeaa0" strokeWidth="2"/>
                <path d="M24 47h47" stroke="#b8ecff" strokeWidth="3" opacity=".72" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          <div className="float-icon n-coin-icon" data-icon="coin" data-phase="5.2" data-period="4.9">
            <div className="icon-art coin-art">
              <svg viewBox="0 0 120 120" role="presentation">
                <defs><radialGradient id="coin-green" cx="28%" cy="20%"><stop stopColor="#d7ffe9"/><stop offset=".48" stopColor="#84e9b6"/><stop offset="1" stopColor="#48c98d"/></radialGradient></defs>
                <circle cx="60" cy="65" r="49" fill="#27956b" opacity=".52" transform="translate(0 4)"/>
                <circle cx="60" cy="58" r="50" fill="url(#coin-green)" stroke="#55bc8d" strokeWidth="3"/>
                <circle cx="60" cy="58" r="40" fill="none" stroke="#ecfff4" strokeWidth="2" opacity=".46"/>
                <text x="60" y="76" textAnchor="middle" fontFamily="Inter,Arial,sans-serif" fontSize="53" fontWeight="600" fill="#164a37">N</text>
                <path d="M28 32q9-11 21-13" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".8"/>
              </svg>
              <svg className="sparkle" viewBox="0 0 36 36" role="presentation"><path d="M18 0c2 10 4 14 18 18-14 4-16 8-18 18C16 26 14 22 0 18 14 14 16 10 18 0Z" fill="#fff9d8"/></svg>
            </div>
          </div>
        </div>

        <div className="hero-copy">
          <div className="title-wrap" id="title-wrap" aria-label="NoBroke">
            <h1 className="wordmark" id="wordmark">NoBroke</h1>
            <div className="glitch-layer" id="glitch-layer" aria-hidden="true"></div>
          </div>
          <p className="tagline" id="tagline" aria-label="Make moves. Unbound."><span>Make</span><span>moves.</span><span>Unbound.</span></p>
        </div>

        <div className="hero-actions" id="hero-actions">
          {session ? (
            <a className="pill-button enter-button" href="/app" data-app-link>ENTER <span aria-hidden="true">→</span></a>
          ) : (
            <>
              <button type="button" className="pill-button" onClick={() => { setNext("/app"); setAuth("login") }}>LOG IN</button>
              <button type="button" className="pill-button pill-solid" onClick={() => { setNext("/app"); setAuth("login") }}>TEAM ACCESS</button>
            </>
          )}
        </div>
        {session && <p className="hero-greeting" aria-live="polite"><ShinyText text={`Signed in as ${session.name}`} speed={3} color="rgba(16,16,15,0.62)" shineColor="#ff4a1c" /></p>}

        <div className="screen-reader-only" aria-live="polite" id="menu-announcement"></div>
      </section>
    </main>
    {auth && <AuthPanel mode={auth} onModeChange={setAuth} onClose={closeAuth} onDone={() => { setAuth(null); navigate(next) }} />}
    </div>
  )
}
