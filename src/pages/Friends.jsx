import { useState } from "react"
import { UserPlus, Check, X, Ban, Pencil } from "lucide-react"
import { toast } from "sonner"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { AmountInput } from "@/components/form-bits"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { PageHeader, StatusBadge, UserAvatar } from "@/components/shared"
import { useStore } from "@/lib/store"
import { inr } from "@/lib/utils"

function AddFriendDialog() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><UserPlus /> Add friend</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add friend</DialogTitle><DialogDescription>They'll get a request to accept.</DialogDescription></DialogHeader>
        <Field><FieldLabel htmlFor="fe">Email or username</FieldLabel><Input id="fe" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!email.trim()} onClick={() => { toast.success(`Request sent to ${email}`); setEmail(""); setOpen(false) }}>Send request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditLimitDialog({ f }) {
  const { update, userName } = useStore()
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(String(f.credit_limit_me_to_them))
  const tooLow = Number(limit) < f.exposure_me_to_them
  const onOpenChange = (v) => { if (v) setLimit(String(f.credit_limit_me_to_them)); setOpen(v) }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button variant="outline" size="sm"><Pencil /> Trust limit</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Trust limit for {userName(f.friend_id)}</DialogTitle>
          <DialogDescription>The most you're willing to have routed through you on their behalf. Set it to ₹0 to never be used as a route.</DialogDescription>
        </DialogHeader>
        <Field data-invalid={tooLow || undefined}>
          <FieldLabel htmlFor="lim">Limit</FieldLabel>
          <Slider min={0} max={10000} step={100} value={[Math.min(Number(limit) || 0, 10000)]} onValueChange={([v]) => setLimit(String(v))} aria-label="Trust limit" className="my-2" />
          <AmountInput id="lim" step="100" value={limit} onChange={(e) => setLimit(e.target.value)} aria-invalid={tooLow || undefined} />
          {tooLow ? <FieldError>{inr(f.exposure_me_to_them)} is already routed through you. The limit can't be lower than that.</FieldError>
            : <FieldDescription>{inr(f.exposure_me_to_them)} of it is in use right now.</FieldDescription>}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={tooLow || limit === ""} onClick={() => {
            update("friendships", (fs) => fs.map((x) => (x.friendship_id === f.friendship_id ? { ...x, credit_limit_me_to_them: Number(limit) } : x)))
            toast.success("Trust limit saved"); setOpen(false)
          }}>Save limit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Friends() {
  const { friendships, userName, update } = useStore()
  const setStatus = (f, status, msg) => { update("friendships", (fs) => fs.map((x) => (x.friendship_id === f.friendship_id ? { ...x, status } : x))); toast(msg) }

  return (
    <>
      <PageHeader title="Friends & trust" description="Debts can only be routed through friends who've set a trust limit." action={<AddFriendDialog />} />
      <div className="grid gap-4 md:grid-cols-2">
        {friendships.map((f) => {
          const used = f.credit_limit_me_to_them ? (f.exposure_me_to_them / f.credit_limit_me_to_them) * 100 : 0
          return (
            <Card key={f.friendship_id}>
              <CardHeader>
                <div className="flex items-center gap-3"><UserAvatar id={f.friend_id} className="size-10" />
                  <div><CardTitle>{userName(f.friend_id)}</CardTitle><CardDescription><StatusBadge status={f.status} /></CardDescription></div>
                </div>
                {f.status === "ACTIVE" && (
                  <CardAction>
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label={`Block ${userName(f.friend_id)}`}><Ban /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Block {userName(f.friend_id)}?</AlertDialogTitle>
                          <AlertDialogDescription>No new debts will be routed between you. Existing balances stay until settled.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => setStatus(f, "BLOCKED", `${userName(f.friend_id)} blocked`)}>Block</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </CardAction>
                )}
              </CardHeader>
              {f.status === "ACTIVE" && (
                <CardContent className="grid gap-4 text-sm">
                  <div className="grid gap-2">
                    <div className="flex justify-between"><span>Routed through you</span><span className="tabular-nums">{inr(f.exposure_me_to_them)} of {inr(f.credit_limit_me_to_them)}</span></div>
                    <Progress value={used} aria-label="Trust limit used" />
                  </div>
                  <div className="flex justify-between text-muted-foreground"><span>Limit they gave you</span><span className="tabular-nums">{inr(f.credit_limit_them_to_me)}</span></div>
                </CardContent>
              )}
              <CardFooter className="gap-2">
                {f.status === "ACTIVE" && <EditLimitDialog f={f} />}
                {f.status === "PENDING" && <>
                  <Button size="sm" onClick={() => setStatus(f, "ACTIVE", "Friend request accepted")}><Check /> Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => { update("friendships", (fs) => fs.filter((x) => x.friendship_id !== f.friendship_id)); toast("Request declined") }}><X /> Decline</Button>
                </>}
                {f.status === "BLOCKED" && <Button size="sm" variant="outline" onClick={() => setStatus(f, "ACTIVE", "Unblocked")}>Unblock</Button>}
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </>
  )
}
