import { useEffect, useState, type FormEvent } from "react"
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isSupabaseConfigured, apiRpc, supabase } from "@/lib/supabase"
import { useAuthLoading, useSession } from "@/lib/session"
import { inviteLoginHref, safePostLoginPath } from "@/lib/auth-navigation"

function Message({ title, children, href = "/", action = "Return to NoBroke" }: { title: string; children: React.ReactNode; href?: string; action?: string }) {
  return <main className="grid min-h-svh place-items-center p-4"><Card className="w-full max-w-md"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{children}</CardDescription></CardHeader><CardContent><Button asChild><Link to={href}>{action}</Link></Button></CardContent></Card></main>
}

export function AuthCallback() {
  const session = useSession()
  const loading = useAuthLoading()
  const [searchParams] = useSearchParams()
  const next = safePostLoginPath(searchParams.get("next"))
  if (loading) return <Message title="Checking your link…">One moment while we verify your sign-in.</Message>
  return session ? <Navigate to={next} replace /> : <Message title="Link expired">Sign in again or create an account to continue.</Message>
}

export function PasswordSetup() {
  const session = useSession()
  const loading = useAuthLoading()
  const navigate = useNavigate()
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    if (password.length < 8) { setError("Use at least 8 characters."); return }
    if (password !== confirm) { setError("Passwords do not match."); return }
    if (!isSupabaseConfigured || !session) { setError("This link has expired. Request a new link."); return }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) { setError("This link has expired. Request a new link."); return }
    setPassword(""); setConfirm(""); setDone(true)
    window.setTimeout(() => navigate("/app/profile", { replace: true }), 900)
  }

  if (loading) return <Message title="Checking your link…">One moment while we verify it.</Message>
  if (done) return <Message title="Password saved">Your account is ready. Taking you to NoBroke…</Message>
  return <main className="grid min-h-svh place-items-center p-4"><Card className="w-full max-w-md">
    <CardHeader><CardTitle>Set your password</CardTitle><CardDescription>Use a password with at least eight characters.</CardDescription></CardHeader>
    <CardContent><form className="grid gap-4" onSubmit={submit}>
      <Input type="password" autoComplete="new-password" aria-label="New password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="New password" />
      <Input type="password" autoComplete="new-password" aria-label="Confirm password" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Confirm password" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={busy || !session}>{busy ? "Saving…" : "Save password"}</Button>
      <Link className="text-sm text-muted-foreground underline" to="/">Back to login</Link>
    </form></CardContent>
  </Card></main>
}

export function GroupInviteAcceptance() {
  const { token = "" } = useParams()
  const session = useSession()
  const loading = useAuthLoading()
  const navigate = useNavigate()
  const [status, setStatus] = useState("Accepting group invite…")
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (loading || !session || !token) return
    let active = true
    void apiRpc<{ group_id: string }>("accept_group_invite", { p_token: token }).then(() => {
      if (active) navigate("/app/groups", { replace: true })
    }).catch(() => {
      if (active) { setStatus("This group invite is invalid, expired, or revoked."); setFailed(true) }
    })
    return () => { active = false }
  }, [loading, session?.userId, token, navigate])
  if (loading) return <Message title="Checking your account…">One moment.</Message>
  if (!session) return <Message title="Sign in to accept this invite" href={inviteLoginHref(token)} action="Continue">Sign in or create an account, then we’ll return you here to accept the invite.</Message>
  return <Message title={failed ? "Invite unavailable" : "Joining group"}>{status}</Message>
}
