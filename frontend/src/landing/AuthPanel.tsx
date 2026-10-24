import { useEffect, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { isSupabaseConfigured, supabase } from "@/lib/supabase"
import { authCallbackUrl, authResetUrl } from "@/lib/auth-navigation"
import { requestSignup } from "@/lib/auth-signup"
import { validateAuthForm } from "@/lib/auth-validation"

export type AuthMode = "login" | "signup" | "recovery"

export function AuthPanel({ mode, next, onModeChange, onClose, onDone }: {
  mode: AuthMode
  next: string
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
  const signup = mode === "signup"

  useEffect(() => {
    panel.current?.querySelector("input")?.focus()
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [mode, onClose])

  const validation = validateAuthForm(mode, email, password)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (!validation.valid || !isSupabaseConfigured) return
    setBusy(true)
    try {
      if (recovery) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: authResetUrl(),
        })
        if (error) throw error
        setSent(true)
      } else if (signup) {
        await requestSignup(supabase.auth, email.trim(), password, authCallbackUrl(next))
        setPassword("")
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
        <h2 id="auth-title" className="auth-title">{recovery ? "Reset password" : signup ? "Create account" : "Log in"}</h2>
        <p className="auth-lede">{recovery
          ? "We’ll email a secure reset link to your account."
          : signup
            ? "Create your NoBroke account. We’ll send a link to verify your email."
            : "Welcome back. Log in to your NoBroke account."}</p>

        {!isSupabaseConfigured ? (
          <p className="auth-note" role="alert">NoBroke is not connected yet. Add the Supabase URL and publishable key to the frontend environment.</p>
        ) : sent ? (
          <p className="auth-note" role="status">{recovery
            ? "If that account exists, a password reset link is on its way."
            : "Check your email for a verification link. After you confirm, we’ll take you back to where you started."}</p>
        ) : (
          <form className="auth-form" onSubmit={submit} noValidate>
            <label className="auth-field">
              <span>EMAIL</span>
              <input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" aria-invalid={touched && !!validation.emailError} />
              {touched && validation.emailError && <em>{validation.emailError}</em>}
            </label>
            {!recovery && <label className="auth-field">
              <span>{signup ? "CREATE PASSWORD" : "PASSWORD"}</span>
              <input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={signup ? "new-password" : "current-password"} aria-invalid={touched && !!validation.passwordError} />
              {touched && validation.passwordError && <em>{validation.passwordError}</em>}
            </label>}
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? "PLEASE WAIT…" : recovery ? "SEND RESET LINK" : signup ? "CREATE ACCOUNT" : "LOG IN"}</button>
          </form>
        )}

        <p className="auth-switch">
          {recovery ? "Remembered it? " : signup ? "Already have an account? " : "New to NoBroke? "}
          <button type="button" disabled={busy} onClick={() => { setTouched(false); setSent(false); setPassword(""); onModeChange(recovery || signup ? "login" : "signup") }}>
            {recovery || signup ? "Log in" : "Create account"}
          </button>
        </p>
        {!recovery && !signup && <p className="auth-note">
          Need a password reset? <button type="button" disabled={busy} onClick={() => { setTouched(false); setSent(false); onModeChange("recovery") }}>Reset password</button>
        </p>}
      </div>
    </div>
  )
}
