import { useEffect, useState } from "react"
import { Lock, EyeOff } from "lucide-react"
import { toast } from "sonner"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { PageHeader } from "@/components/shared"
import { useStore } from "@/lib/store"
import { apiRpc, supabase } from "@/lib/supabase"
import { reloadProfile, useSession } from "@/lib/session"

const preferenceLabels = [
  ["reminders", "Payment reminders", "When someone sends you a debt reminder."],
  ["cascades", "Payment and task updates", "When a payment or forwarding task changes."],
  ["recurring", "Recurring bills", "When a scheduled bill is added or needs attention."],
  ["social", "Friend requests", "When someone sends you a friend request."],
] as const

export default function Profile() {
  const { myFinancials, notificationPreferences, refresh } = useStore()
  const session = useSession()
  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState(session?.email ?? "")
  const [income, setIncome] = useState("")
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [prefs, setPrefs] = useState(notificationPreferences)

  useEffect(() => {
    setEmail(session?.email ?? "")
    void apiRpc<{ username: string; display_name: string }>("get_my_profile").then((profile) => {
      setUsername(profile.username)
      setDisplayName(profile.display_name)
    }).catch(() => toast.error("Could not load your profile."))
  }, [session?.userId, session?.email])

  useEffect(() => setPrefs(notificationPreferences), [notificationPreferences])

  const saveAccount = async () => {
    setSaving(true)
    try {
      await apiRpc("update_my_profile", { p_username: username.trim(), p_display_name: displayName.trim() })
      const currentEmail = session?.email.trim().toLowerCase() ?? ""
      const requestedEmail = email.trim().toLowerCase()
      let emailMessage = ""
      if (requestedEmail && requestedEmail !== currentEmail) {
        const { error } = await supabase.auth.updateUser({ email: requestedEmail })
        if (error) throw new Error("email_update_failed")
        emailMessage = " Check your new address to confirm the change."
      }
      await reloadProfile()
      toast.success(`Profile saved.${emailMessage}`)
    } catch (error) {
      const code = error instanceof Error ? error.message : "request_failed"
      toast.error(code === "email_update_failed" ? "Profile saved, but Supabase could not start email confirmation." : "Could not save your profile. Check your username and display name.")
    } finally { setSaving(false) }
  }

  const saveIncome = async () => {
    setSaving(true)
    try {
      await apiRpc("set_private_income", { p_monthly_income: income })
      setIncome("")
      await refresh()
      toast.success("Income band saved privately")
    } catch {
      toast.error("Could not save that amount. Enter a positive monthly income.")
    } finally { setSaving(false) }
  }

  const clearIncome = async () => {
    setSaving(true)
    try {
      await apiRpc("clear_private_income")
      setIncome("")
      await refresh()
      toast.success("Private income setup cleared")
    } catch { toast.error("Could not clear private income setup.") }
    finally { setSaving(false) }
  }

  const savePreferences = async (next: typeof prefs) => {
    setPrefs(next)
    setSavingPreferences(true)
    try {
      await apiRpc("update_notification_preferences", { p_preferences: next })
      toast.success("Notification preferences saved")
    } catch {
      setPrefs(notificationPreferences)
      toast.error("Could not save notification preferences.")
    } finally { setSavingPreferences(false) }
  }

  return (
    <>
      <PageHeader title="Profile & privacy" description="Manage your account, private split setup and notifications." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Account</CardTitle><CardDescription>Email changes take effect after you confirm the message Supabase sends.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="un">Username</Label><Input id="un" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></div>
            <div className="grid gap-2"><Label htmlFor="dn">Display name</Label><Input id="dn" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" /></div>
            <div className="grid gap-2"><Label htmlFor="em">Email</Label><Input id="em" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></div>
          </CardContent>
          <CardFooter><Button disabled={saving || !username.trim() || !displayName.trim()} onClick={() => void saveAccount()}>{saving && <Spinner />} Save account</Button></CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="size-4" /> Private income</CardTitle>
            <CardDescription>Only the derived weight is used for future income-ratio splits.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Alert>
              <EyeOff />
              <AlertTitle>{myFinancials.configured ? "Private split setup is on" : "Your income stays private"}</AlertTitle>
              <AlertDescription>Your exact amount is converted to a private band in PostgreSQL, then discarded. Other members see their own shares; those shares can still reveal relative bands.</AlertDescription>
            </Alert>
            <div className="grid gap-2">
              <Label htmlFor="inc">Monthly income (₹)</Label>
              <div className="flex gap-2">
                <Input id="inc" type={show ? "number" : "password"} min="1" inputMode="decimal" value={income} onChange={(event) => setIncome(event.target.value)} autoComplete="off" />
                <Button type="button" variant="outline" onClick={() => setShow((value) => !value)}>{show ? "Hide" : "Show"}</Button>
              </div>
              <p className="text-xs text-muted-foreground">NoBroke never returns the saved amount or band.</p>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
            <Button disabled={!(Number(income) > 0) || saving} onClick={() => void saveIncome()}>{saving && <Spinner />} Save privately</Button>
            {myFinancials.configured && <Button variant="outline" disabled={saving} onClick={() => void clearIncome()}>Clear setup</Button>}
          </CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Notifications</CardTitle><CardDescription>{savingPreferences ? "Saving…" : "Choose which optional updates appear in your inbox."}</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          {preferenceLabels.map(([key, title, description], index) => (
            <div key={key} className="grid gap-4">
              {index > 0 && <Separator />}
              <div className="flex items-center justify-between gap-4">
                <div><div className="text-sm font-medium">{title}</div><div className="text-sm text-muted-foreground">{description}</div></div>
                <Switch checked={prefs[key]} onCheckedChange={(value) => void savePreferences({ ...prefs, [key]: value })} aria-label={title} />
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Pending payments and forwarding tasks stay visible even when optional updates are off.</p>
        </CardContent>
      </Card>
    </>
  )
}
