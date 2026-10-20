import { useState } from "react"
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

export default function Profile() {
  const { myFinancials, update, resetDemo } = useStore()
  const [income, setIncome] = useState(String(myFinancials.monthly_income))
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [prefs, setPrefs] = useState({ reminders: true, cascades: true, recurring: false })

  const saveIncome = () => {
    setSaving(true)
    setTimeout(() => { // mock request
      update("myFinancials", (f) => ({ ...f, monthly_income: Number(income), updated_at: new Date().toISOString().slice(0, 10) }))
      setSaving(false); toast.success("Income saved privately")
    }, 600)
  }

  return (
    <>
      <PageHeader title="Profile & privacy" description="Your account details and the private income used for fair splits." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2"><Label htmlFor="un">Username</Label><Input id="un" defaultValue="you" /></div>
            <div className="grid gap-2"><Label htmlFor="em">Email</Label><Input id="em" type="email" defaultValue="you@example.com" /></div>
          </CardContent>
          <CardFooter><Button onClick={() => toast.success("Account saved")}>Save account</Button></CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lock className="size-4" /> Private income</CardTitle>
            <CardDescription>Used only for "By income" splits.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Alert>
              <EyeOff />
              <AlertTitle>Only you can see this</AlertTitle>
              <AlertDescription>Your income is turned into a broad band before any split. Friends only see their own share, never your income.</AlertDescription>
            </Alert>
            <div className="grid gap-2">
              <Label htmlFor="inc">Monthly income (₹)</Label>
              <div className="flex gap-2">
                <Input id="inc" type={show ? "number" : "password"} min="1" value={income} onChange={(e) => setIncome(e.target.value)} />
                <Button variant="outline" onClick={() => setShow((s) => !s)}>{show ? "Hide" : "Show"}</Button>
              </div>
              <p className="text-xs text-muted-foreground">Last updated {myFinancials.updated_at}</p>
            </div>
          </CardContent>
          <CardFooter><Button disabled={!(Number(income) > 0) || saving} onClick={saveIncome}>{saving && <Spinner />} Save income</Button></CardFooter>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          {[["reminders", "Payment reminders", "When someone reminds you about a debt."], ["cascades", "Auto-forwarded payments", "When a pay-when-paid rule sends money on."], ["recurring", "Recurring bills", "The day before a bill is added."]].map(([k, t, d], i) => (
            <div key={k} className="grid gap-4">
              {i > 0 && <Separator />}
              <div className="flex items-center justify-between gap-4">
                <div><div className="text-sm font-medium">{t}</div><div className="text-sm text-muted-foreground">{d}</div></div>
                <Switch checked={prefs[k]} onCheckedChange={(v) => setPrefs((p) => ({ ...p, [k]: v }))} aria-label={t} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Demo data</CardTitle>
          <CardDescription>Your changes are saved in this browser until NoBroke has its real backend.</CardDescription>
        </CardHeader>
        <CardFooter><Button variant="outline" onClick={() => { resetDemo(); toast.success("Sample data restored") }}>Reset to sample data</Button></CardFooter>
      </Card>
    </>
  )
}
