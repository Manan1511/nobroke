// Log in / Sign up panel on the landing page, in the landing's own look (frosted cream glass, pill fields).
// Demo only: it saves the name and email in this browser (see lib/session.js). The password is checked
// for length and then dropped; the backend team swaps this for real accounts.
import { useEffect, useRef, useState, type FormEvent } from "react"
import { signIn } from "@/lib/session"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export type AuthMode = "login" | "signup"

export function AuthPanel({ mode, onModeChange, onClose, onDone }: { mode: AuthMode; onModeChange: (m: AuthMode) => void; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [touched, setTouched] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const signup = mode === "signup"

  useEffect(() => {
    panel.current?.querySelector("input")?.focus()
    const onKey = (e) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [mode, onClose])

  const errors = {
    name: signup && !name.trim() ? "Tell us what to call you." : "",
    email: !EMAIL.test(email.trim()) ? "Enter an email like name@example.com." : "",
    password: password.length < 8 ? "Use at least 8 characters." : "",
  }
  const valid = !errors.name && !errors.email && !errors.password

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!valid) return
    signIn({ name: signup ? name : email.split("@")[0], email })
    onDone()
  }

  return (
    <div className="auth-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={panel} className="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" className="auth-close" onClick={onClose} aria-label="Close"><span></span><span></span></button>
        <h2 id="auth-title" className="auth-title">{signup ? "Sign up" : "Log in"}</h2>
        <p className="auth-lede">{signup ? "Split bills with friends and settle through people you trust." : "Welcome back. Pick up where you left off."}</p>

        <form className="auth-form" onSubmit={submit} noValidate>
          {signup && (
            <label className="auth-field">
              <span>NAME</span>
              <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" aria-invalid={touched && !!errors.name} />
              {touched && errors.name && <em>{errors.name}</em>}
            </label>
          )}
          <label className="auth-field">
            <span>EMAIL</span>
            <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" aria-invalid={touched && !!errors.email} />
            {touched && errors.email && <em>{errors.email}</em>}
          </label>
          <label className="auth-field">
            <span>PASSWORD</span>
            <input id="auth-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? "new-password" : "current-password"} aria-invalid={touched && !!errors.password} />
            {touched && errors.password && <em>{errors.password}</em>}
          </label>
          <button type="submit" className="auth-submit">{signup ? "CREATE ACCOUNT" : "LOG IN"}</button>
        </form>

        <p className="auth-switch">
          {signup ? "Already have an account? " : "New to NoBroke? "}
          <button type="button" onClick={() => { setTouched(false); onModeChange(signup ? "login" : "signup") }}>{signup ? "Log in" : "Sign up"}</button>
        </p>
        <p className="auth-note">Demo: your name and email stay in this browser. No account is created yet.</p>
      </div>
    </div>
  )
}
