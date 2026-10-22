import { useEffect, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"

export type AuthMode = "login" | "recovery"

export function AuthPanel({ mode, onModeChange, onClose, onDone }: {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onClose: () => void
  onDone: () => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [touched, setTouched] = useState(false)
  const [sent, setSent] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const recovery = mode === "recovery"

  useEffect(() => {
    panel.current?.querySelector("input")?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [mode, onClose])

  const emailError = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
    ? "Enter a valid email address." : ""

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (emailError || (!recovery && password.length < 8) || !isSupabaseConfigured) return
    setBusy(true)
    try {
      if (recovery) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/reset`,
        })
        if (error) throw error
        setSent(true)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        onDone()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "request_failed"
      toast.error(message === "Invalid login credentials"
        ? "Email or password is incorrect."
        : message.toLowerCase().includes("email not confirmed")
          ? "Confirm your email before logging in."
          : "We could not complete that request. Check your details and try again.")
    } finally { setBusy(false) }
  }

  return (
    <div className="auth-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={panel} className="auth-panel" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" className="auth-close" onClick={onClose} aria-label="Close"><span></span><span></span></button>
        <h2 id="auth-title" className="auth-title">{recovery ? "Reset password" : "Log in"}</h2>
        <p className="auth-lede">{recovery
          ? "We’ll email a secure reset link to your account."
          : "Welcome back. NoBroke access is limited to invited team members."}</p>

        {!isSupabaseConfigured ? (
          <p className="auth-note" role="alert">NoBroke is not connected yet. Add the Supabase URL and publishable key to the frontend environment.</p>
        ) : sent ? (
          <p className="auth-note" role="status">If that account exists, a password reset link is on its way.</p>
        ) : (
          <form className="auth-form" onSubmit={submit} noValidate>
            <label className="auth-field">
              <span>EMAIL</span>
              <input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" aria-invalid={touched && !!emailError} />
              {touched && emailError && <em>{emailError}</em>}
            </label>
            {!recovery && <label className="auth-field">
              <span>PASSWORD</span>
              <input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-invalid={touched && password.length < 8} />
              {touched && password.length < 8 && <em>Enter your password.</em>}
            </label>}
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? "PLEASE WAIT…" : recovery ? "SEND RESET LINK" : "LOG IN"}</button>
          </form>
        )}

        <p className="auth-switch">
          {recovery ? "Remembered it? " : "Need a password reset? "}
          <button type="button" onClick={() => { setTouched(false); setSent(false); onModeChange(recovery ? "login" : "recovery") }}>
            {recovery ? "Log in" : "Reset password"}
          </button>
        </p>
        <p className="auth-note">New accounts join through a team invitation.</p>
      </div>
    </div>
  )
}
