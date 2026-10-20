import { useState } from "react"
import { UserPlus, Check, X, Ban, Pencil, History, ArrowRight } from "lucide-react"
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
import { cn, inr } from "@/lib/utils"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Money, Reveal, Spotlight } from "@/components/motion"
import { label } from "@/components/shared"
import type { Friendship, FriendshipStatus } from "@/types"

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

function EditLimitDialog({ f }: { f: Friendship }) {
  const { update, userName } = useStore()
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(String(f.credit_limit_me_to_them))
  const tooLow = Number(limit) < f.exposure_me_to_them
  const onOpenChange = (v: boolean) => { if (v) setLimit(String(f.credit_limit_me_to_them)); setOpen(v) }
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

/** Everything you share with one friend: balance, open debts, groups and past settlements. */
function FriendHistory({ id }: { id: string }) {
  const { obligations, groups, batches, userName, me } = useStore()
  const debts = obligations.filter((o) => (o.debtor_id === me && o.creditor_id === id) || (o.debtor_id === id && o.creditor_id === me))
  const open = debts.filter((o) => o.status !== "SETTLED")
  const net = open.reduce((s, o) => s + (o.creditor_id === me ? o.remaining_amount : -o.remaining_amount), 0)
  const shared = groups.filter((g) => g.members.includes(me) && g.members.includes(id))
  const settled = batches.filter((b) => b.legs.some((l) => l.from_user === id || l.to_user === id))
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" variant="ghost"><History /> History</Button></SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <div className="flex items-center gap-3"><UserAvatar id={id} className="size-12" />
            <div><SheetTitle className="font-display text-3xl font-normal">{userName(id)}</SheetTitle><SheetDescription>Everything you two share on NoBroke.</SheetDescription></div>
          </div>
        </SheetHeader>
        <Reveal className="grid gap-5 px-4 pb-6" stagger={0.07}>
          <div className={cn("rounded-3xl border p-4", net > 0 ? "bg-positive-soft" : net < 0 ? "bg-negative-soft" : "bg-muted")}>
            <div className="text-xs text-muted-foreground">{net > 0 ? "Owes you" : net < 0 ? "You owe" : "Balance"}</div>
            <div className={cn("text-3xl font-semibold", net > 0 ? "text-positive" : net < 0 ? "text-negative" : "")}>{net === 0 ? "All square" : <Money value={Math.abs(net)} />}</div>
          </div>
          <section className="grid gap-2">
            <h3 className="text-sm font-medium">Debts between you</h3>
            {debts.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
            {debts.map((o) => (
              <div key={o.obligation_id} className="flex items-center gap-2 rounded-2xl border bg-background/40 p-3 text-sm">
                <span className="flex-1 truncate">{o.debtor_id === me ? "You owe" : "Owes you"} · {o.source}</span>
                <Badge variant="outline">{label(o.status)}</Badge>
                <span className="w-24 text-right tabular-nums">{inr(o.remaining_amount)}</span>
              </div>
            ))}
          </section>
          <section className="grid gap-2">
            <h3 className="text-sm font-medium">Groups together</h3>
            <div className="flex flex-wrap gap-2">{shared.length ? shared.map((g) => <Badge key={g.group_id} variant="secondary">{g.group_name}</Badge>) : <span className="text-sm text-muted-foreground">No shared groups.</span>}</div>
          </section>
          <section className="grid gap-2">
            <h3 className="text-sm font-medium">Settlements involving {userName(id).split(" ")[0]}</h3>
            {settled.length === 0 && <p className="text-sm text-muted-foreground">None yet.</p>}
            {settled.map((b) => (
              <div key={b.batch_id} className="grid gap-1 rounded-2xl border bg-background/40 p-3 text-sm">
                <div className="flex justify-between"><span className="font-medium">{label(b.settlement_type)}</span><span className="tabular-nums">{inr(b.total_cleared)}</span></div>
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {b.legs.map((l, i) => <span key={i} className="flex items-center gap-1">{userName(l.from_user)} <ArrowRight className="size-3" /> {userName(l.to_user)}{i < b.legs.length - 1 && ","}</span>)}
                  <span className="ml-auto">{b.executed_at}</span>
                </div>
              </div>
            ))}
          </section>
        </Reveal>
      </SheetContent>
    </Sheet>
  )
}

export default function Friends() {
  const { friendships, userName, update } = useStore()
  const setStatus = (f: Friendship, status: FriendshipStatus, msg: string) => { update("friendships", (fs) => fs.map((x) => (x.friendship_id === f.friendship_id ? { ...x, status } : x))); toast(msg) }

  return (
    <>
      <PageHeader title="Friends & trust" description="Debts can only be routed through friends who've set a trust limit." action={<AddFriendDialog />} />
      <div className="grid gap-4 md:grid-cols-2">
        {friendships.map((f) => {
          const used = f.credit_limit_me_to_them ? (f.exposure_me_to_them / f.credit_limit_me_to_them) * 100 : 0
          return (
            <Spotlight key={f.friendship_id}><Card className="h-full">
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
                          <AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive/90" onClick={() => setStatus(f, "BLOCKED", `${userName(f.friend_id)} blocked`)}>Block</AlertDialogAction></AlertDialogFooter>
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
              <CardFooter className="mt-auto gap-2">
                {f.status === "ACTIVE" && <EditLimitDialog f={f} />}
                <FriendHistory id={f.friend_id} />
                {f.status === "PENDING" && <>
                  <Button size="sm" onClick={() => setStatus(f, "ACTIVE", "Friend request accepted")}><Check /> Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => { update("friendships", (fs) => fs.filter((x) => x.friendship_id !== f.friendship_id)); toast("Request declined") }}><X /> Decline</Button>
                </>}
                {f.status === "BLOCKED" && <Button size="sm" variant="outline" onClick={() => setStatus(f, "ACTIVE", "Unblocked")}>Unblock</Button>}
              </CardFooter>
            </Card></Spotlight>
          )
        })}
      </div>
    </>
  )
}
