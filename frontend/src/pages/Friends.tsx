import { useState } from "react"
import { UserPlus, UserRoundMinus, Check, X, Ban, Pencil, History, ArrowRight } from "lucide-react"
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
import { apiRpc } from "@/lib/supabase"
import { cn, inr } from "@/lib/utils"
import { compareMoney, moneyRatio } from "@/lib/money.mjs"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Reveal, Spotlight } from "@/components/motion"
import { label } from "@/components/shared"
import type { Friendship } from "@/types"

function AddFriendDialog() {
  const { refreshFriendships } = useStore()
  const [open, setOpen] = useState(false)
  const [username, setUsername] = useState("")
  const [saving, setSaving] = useState(false)
  const send = async () => {
    setSaving(true)
    try {
      await apiRpc("request_friendship", { p_username: username.trim().replace(/^@/, "") })
      await refreshFriendships()
      toast.success("Friend request sent")
      setUsername(""); setOpen(false)
    } catch { toast.error("No user found for that username, or a request already exists.") }
    finally { setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button><UserPlus /> Add friend</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Add a friend</DialogTitle><DialogDescription>Search by exact username. No email or open user directory is exposed.</DialogDescription></DialogHeader>
      <Field><FieldLabel htmlFor="friend-username">Username</FieldLabel><Input id="friend-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="their-username" autoComplete="off" /></Field>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        <Button disabled={!username.trim() || saving} onClick={() => void send()}>{saving ? "Sending…" : "Send request"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function EditLimitDialog({ friendship }: { friendship: Friendship }) {
  const { refreshFriendships, userName } = useStore()
  const [open, setOpen] = useState(false)
  const [limit, setLimit] = useState(String(friendship.credit_limit_me_to_them))
  const [saving, setSaving] = useState(false)
  const tooLow = compareMoney(limit, friendship.exposure_me_to_them) === -1
  const onOpenChange = (value: boolean) => { if (value) setLimit(String(friendship.credit_limit_me_to_them)); setOpen(value) }
  const save = async () => {
    setSaving(true)
    try {
      await apiRpc("set_trust_limit", { p_debtor_user_id: friendship.friend_id, p_limit_amount: limit })
      await refreshFriendships(); toast.success("Trust limit saved"); setOpen(false)
    } catch { toast.error("Could not save the limit. It cannot fall below routed exposure.") }
    finally { setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger asChild><Button variant="outline" size="sm"><Pencil /> Trust limit</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Trust you grant {userName(friendship.friend_id)}</DialogTitle>
        <DialogDescription>You are the creditor granting this limit to your friend as debtor. Set ₹0 to give no routing consent.</DialogDescription></DialogHeader>
      <Field data-invalid={tooLow || undefined}>
        <FieldLabel htmlFor="trust-limit">Limit</FieldLabel>
        <Slider min={0} max={100000} step={100} value={[Math.min(Number(limit) || 0, 100000)]} onValueChange={([value]) => setLimit(String(value))} aria-label="Trust limit" className="my-2" />
        <AmountInput id="trust-limit" value={limit} onChange={(event) => setLimit(event.target.value)} aria-invalid={tooLow || undefined} />
        {tooLow ? <FieldError>{inr(friendship.exposure_me_to_them)} is already in use. The limit cannot be lower.</FieldError>
          : <FieldDescription>{inr(friendship.exposure_me_to_them)} of the limit is in routed exposure.</FieldDescription>}
      </Field>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        <Button disabled={tooLow || limit === "" || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save limit"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}

function FriendHistory({ id }: { id: string }) {
  const { obligations, groups, batches, userName, me } = useStore()
  const debts = obligations.filter((item) => (item.debtor_id === me && item.creditor_id === id) || (item.debtor_id === id && item.creditor_id === me))
  const shared = groups.filter((group) => group.members.includes(me) && group.members.includes(id))
  const history = batches.filter((batch) => batch.legs.some((leg) =>
    (leg.from_user === me && leg.to_user === id) || (leg.from_user === id && leg.to_user === me)))
  return <Sheet>
    <SheetTrigger asChild><Button size="sm" variant="ghost"><History /> History</Button></SheetTrigger>
    <SheetContent className="w-full overflow-y-auto sm:max-w-md">
      <SheetHeader><div className="flex items-center gap-3"><UserAvatar id={id} className="size-12" />
        <div><SheetTitle className="font-display text-3xl font-normal">{userName(id)}</SheetTitle><SheetDescription>Debts and activity you share.</SheetDescription></div>
      </div></SheetHeader>
      <Reveal className="grid gap-5 px-4 pb-6" stagger={0.07}>
        <section className="grid gap-2"><h3 className="text-sm font-medium">Debts between you</h3>
          {debts.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
          {debts.map((obligation) => <div key={obligation.obligation_id} className="flex items-center gap-2 rounded-2xl border bg-background/40 p-3 text-sm">
            <span className="flex-1 truncate">{obligation.debtor_id === me ? "You owe" : "Owes you"} · {obligation.source}</span>
            <Badge variant="outline">{label(obligation.status)}</Badge><span className="w-24 text-right tabular-nums">{inr(obligation.remaining_amount)}</span>
          </div>)}
        </section>
        <section className="grid gap-2"><h3 className="text-sm font-medium">Groups together</h3>
          <div className="flex flex-wrap gap-2">{shared.length ? shared.map((group) => <Badge key={group.group_id} variant="secondary">{group.group_name}</Badge>) : <span className="text-sm text-muted-foreground">No shared groups.</span>}</div>
        </section>
        <section className="grid gap-2"><h3 className="text-sm font-medium">Confirmed activity</h3>
          {history.length === 0 && <p className="text-sm text-muted-foreground">No confirmed activity together.</p>}
          {history.map((batch) => <div key={batch.batch_id} className="grid gap-1 rounded-2xl border bg-background/40 p-3 text-sm">
            <div className="flex justify-between"><span className="font-medium">{label(batch.settlement_type)}</span><span className="tabular-nums">{inr(batch.total_cleared)}</span></div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">{batch.legs.map((leg, index) => <span key={index} className="flex items-center gap-1">{userName(leg.from_user)} <ArrowRight className="size-3" /> {userName(leg.to_user)}</span>)}<span className="ml-auto">{batch.executed_at}</span></div>
          </div>)}
        </section>
      </Reveal>
    </SheetContent>
  </Sheet>
}

export default function Friends() {
  const { friendships, userName, me, globalNettingEnabled, update, refreshFriendships } = useStore()
  const [busy, setBusy] = useState("")
  const [savingNetting, setSavingNetting] = useState(false)
  const setNetting = async (enabled: boolean) => {
    setSavingNetting(true)
    try {
      await apiRpc("set_global_netting_preference", { p_enabled: enabled })
      update("globalNettingEnabled", () => enabled)
      await refreshFriendships()
      toast.success(enabled ? "Global friend netting enabled" : "Global friend netting disabled")
    } catch {
      toast.error("Could not update your global netting preference.")
    } finally { setSavingNetting(false) }
  }
  const act = async (friendship: Friendship, operation: string, success: string, args?: Record<string, unknown>) => {
    setBusy(friendship.friendship_id)
    try { await apiRpc(operation, args ?? { p_friendship_id: friendship.friendship_id }); await refreshFriendships(); toast.success(success) }
    catch { toast.error("Could not update this friendship. Refresh and try again.") }
    finally { setBusy("") }
  }

  return <>
    <PageHeader title="Friends & trust" description="Friend links and directional limits control debt routing and global settlement." action={<AddFriendDialog />} />
    <Card>
      <CardHeader><CardTitle>Global friend netting</CardTitle>
        <CardDescription>Combine eligible balances across groups into one payment plan. Global netting is on by default, and anyone can turn it off. Debts change only after the creditor confirms payment.</CardDescription></CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl text-sm text-muted-foreground">Turning this off prevents new plans. It does not cancel a plan you have already accepted.</div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-full border bg-background/40 px-4 py-2 text-sm font-medium">
          <input type="checkbox" className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            checked={globalNettingEnabled} disabled={savingNetting}
            onChange={(event) => void setNetting(event.currentTarget.checked)} />
          {savingNetting ? "Saving…" : globalNettingEnabled ? "Enabled" : "Off"}
        </label>
      </CardContent>
    </Card>
    {friendships.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Add a friend by exact username to start managing trust.</CardContent></Card> :
      <div className="grid gap-4 md:grid-cols-2">
        {friendships.map((friendship) => {
          const used = Math.min(100, moneyRatio(friendship.exposure_me_to_them, friendship.credit_limit_me_to_them) * 100)
          const incomingRequest = friendship.status === "PENDING" && friendship.requested_by !== me
          return <Spotlight key={friendship.friendship_id}><Card className="h-full">
            <CardHeader>
              <div className="flex items-center gap-3"><UserAvatar id={friendship.friend_id} className="size-10" />
                <div><CardTitle>{userName(friendship.friend_id)}</CardTitle><CardDescription><StatusBadge status={friendship.status} /></CardDescription></div>
              </div>
              {friendship.status === "ACTIVE" && <CardAction><AlertDialog>
                <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label={`Block ${userName(friendship.friend_id)}`}><Ban /></Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Block {userName(friendship.friend_id)}?</AlertDialogTitle>
                  <AlertDialogDescription>Blocking stops new routing and optional reminders. Existing debts remain payable.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive/90" onClick={() => void act(friendship, "block_friend", `${userName(friendship.friend_id)} blocked`)}>Block</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog></CardAction>}
            </CardHeader>
            {friendship.status === "ACTIVE" && <CardContent className="grid gap-4 text-sm">
              <div className="flex items-center justify-between text-muted-foreground"><span>Global netting</span><span className={friendship.global_netting_enabled ? "text-emerald-400" : ""}>{friendship.global_netting_enabled ? "Enabled" : "Off"}</span></div>
              <div className="grid gap-2"><div className="flex justify-between"><span>Trust you granted</span><span className="tabular-nums">{inr(friendship.exposure_me_to_them)} used of {inr(friendship.credit_limit_me_to_them)}</span></div><Progress value={used} aria-label="Trust limit used" /></div>
              <div className="flex justify-between text-muted-foreground"><span>Trust they granted you</span><span className="tabular-nums">{inr(friendship.credit_limit_them_to_me)}</span></div>
            </CardContent>}
            <CardFooter className="mt-auto flex-wrap gap-2">
              {friendship.status === "ACTIVE" && <EditLimitDialog friendship={friendship} />}
              <FriendHistory id={friendship.friend_id} />
              {friendship.status === "ACTIVE" && <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={busy === friendship.friendship_id}>
                    <UserRoundMinus /> Remove friend
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader>
                  <AlertDialogTitle>Remove {userName(friendship.friend_id)} as a friend?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This ends friend-based routing and global settlement with {userName(friendship.friend_id)}. Existing balances and settlement history stay available, and can still be paid through Settle up. Either of you can send a new friend request later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive/90" disabled={busy === friendship.friendship_id}
                      onClick={() => void act(friendship, "remove_friend", `${userName(friendship.friend_id)} removed from friends`)}>
                      Remove friend
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>}
              {incomingRequest && <>
                <Button size="sm" disabled={busy === friendship.friendship_id} onClick={() => void act(friendship, "respond_friendship", "Friend request accepted", { p_friendship_id: friendship.friendship_id, p_accept: true })}><Check /> Accept</Button>
                <Button size="sm" variant="outline" disabled={busy === friendship.friendship_id} onClick={() => void act(friendship, "respond_friendship", "Friend request declined", { p_friendship_id: friendship.friendship_id, p_accept: false })}><X /> Decline</Button>
              </>}
              {friendship.status === "PENDING" && !incomingRequest && <span className="text-xs text-muted-foreground">Request sent · waiting for reply</span>}
              {friendship.status === "BLOCKED" && <span className="text-xs text-muted-foreground">Blocked. Existing debts remain visible.</span>}
              {friendship.status === "DECLINED" && <span className="text-xs text-muted-foreground">Request declined.</span>}
            </CardFooter>
          </Card></Spotlight>
        })}
      </div>}
  </>
}
