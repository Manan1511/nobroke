import { useState } from "react"
import { Plus, Info, CalendarClock, Repeat } from "lucide-react"
import { toast } from "sonner"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { PageHeader, AvatarStack, label } from "@/components/shared"
import { useStore, newId } from "@/lib/store"
import { inr } from "@/lib/utils"

function NewBillDialog() {
  const { groups, userName, update, me } = useStore()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ group_id: groups[0]?.group_id ?? "", title: "", total_amount: "", paid_by: me, split_mode: "EQUAL", frequency: "MONTHLY", next_run_date: "" })
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const group = groups.find((g) => g.group_id === f.group_id)
  const tooFewForIncome = f.split_mode === "INCOME_RATIO" && (group?.members.length ?? 0) < 3
  const ok = f.title.trim() && Number(f.total_amount) > 0 && f.next_run_date && !tooFewForIncome

  const save = () => {
    update("recurring", (r) => [...r, { ...f, template_id: newId("t"), total_amount: Number(f.total_amount), is_active: true, participants: group.members }])
    toast.success(`${f.title} will be billed ${label(f.frequency).toLowerCase()}`)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> New recurring bill</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New recurring bill</DialogTitle>
          <DialogDescription>Set it up once. It's split and added to balances on every billing date.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="rg">Group</Label>
            <NativeSelect id="rg" value={f.group_id} onChange={set("group_id")}>{groups.map((g) => <NativeSelectOption key={g.group_id} value={g.group_id}>{g.group_name}</NativeSelectOption>)}</NativeSelect></div>
          <div className="grid gap-2"><Label htmlFor="rp">Paid by</Label>
            <NativeSelect id="rp" value={f.paid_by} onChange={set("paid_by")}>{group?.members.map((id) => <NativeSelectOption key={id} value={id}>{userName(id)}</NativeSelectOption>)}</NativeSelect></div>
          <div className="grid gap-2"><Label htmlFor="rt">Bill name</Label><Input id="rt" value={f.title} onChange={set("title")} placeholder="Rent, Wi-Fi, Spotify…" /></div>
          <div className="grid gap-2"><Label htmlFor="ra">Amount (₹)</Label><Input id="ra" type="number" min="0" step="0.01" value={f.total_amount} onChange={set("total_amount")} /></div>
          <div className="grid gap-2"><Label htmlFor="rf">Repeats</Label>
            <NativeSelect id="rf" value={f.frequency} onChange={set("frequency")}>{["WEEKLY", "MONTHLY", "YEARLY"].map((x) => <NativeSelectOption key={x} value={x}>{label(x)}</NativeSelectOption>)}</NativeSelect></div>
          <div className="grid gap-2"><Label htmlFor="rd">First billing date</Label><Input id="rd" type="date" value={f.next_run_date} onChange={set("next_run_date")} /></div>
        </div>
        <div className="grid gap-3"><Label>Split</Label>
          <RadioGroup value={f.split_mode} onValueChange={set("split_mode")} className="sm:grid-cols-3">
            {["EQUAL", "EXACT", "INCOME_RATIO"].map((m) => <Label key={m} className="rounded-md border p-3 font-normal"><RadioGroupItem value={m} /> {label(m)}</Label>)}
          </RadioGroup>
        </div>
        {tooFewForIncome && (
          <Alert variant="destructive"><Info /><AlertTitle>Add at least 3 people</AlertTitle><AlertDescription>Income splits need 3 or more people so nobody's income can be worked out.</AlertDescription></Alert>
        )}
        <Alert><CalendarClock /><AlertTitle>Billed once per date</AlertTitle><AlertDescription>Each billing date is charged only once, even if the scheduler runs twice.</AlertDescription></Alert>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!ok} onClick={save}>Create bill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Recurring() {
  const { recurring, update, userName, groupName } = useStore()
  const toggle = (t, v) => {
    update("recurring", (r) => r.map((x) => (x.template_id === t.template_id ? { ...x, is_active: v } : x)))
    toast(v ? `${t.title} resumed` : `${t.title} paused`)
  }
  return (
    <>
      <PageHeader title="Recurring bills" description="Rent, Wi-Fi and subscriptions that split themselves." action={<NewBillDialog />} />
      {recurring.length === 0 ? (
        <Empty>
          <EmptyHeader><EmptyMedia><Repeat /></EmptyMedia><EmptyTitle>No recurring bills</EmptyTitle><EmptyDescription>Add rent or a subscription once and stop re-entering it every month.</EmptyDescription></EmptyHeader>
          <EmptyContent><NewBillDialog /></EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recurring.map((t) => (
            <Card key={t.template_id} className={t.is_active ? "" : "opacity-60"}>
              <CardHeader>
                <CardTitle>{t.title}</CardTitle>
                <CardDescription>{groupName(t.group_id)} · paid by {userName(t.paid_by)}</CardDescription>
                <CardAction><Switch checked={t.is_active} onCheckedChange={(v) => toggle(t, v)} aria-label={`${t.title} active`} /></CardAction>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="text-2xl font-semibold tabular-nums">{inr(t.total_amount)}</div>
                <div className="flex flex-wrap gap-2"><Badge variant="secondary">{label(t.frequency)}</Badge><Badge variant="outline">{label(t.split_mode)}</Badge></div>
                <AvatarStack ids={t.participants} />
              </CardContent>
              <CardFooter className="text-sm text-muted-foreground">{t.is_active ? `Next bill: ${t.next_run_date}` : "Paused"}</CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
