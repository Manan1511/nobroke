import { useEffect, useRef, useState } from "react"
import { Plus, Info, CalendarClock, Repeat, Pencil, CircleAlert, History } from "lucide-react"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { PageHeader, AvatarStack, label } from "@/components/shared"
import { AmountInput, DatePicker, PeoplePicker, SimpleSelect, SplitModeToggle } from "@/components/form-bits"
import { useStore } from "@/lib/store"
import { apiRpc } from "@/lib/supabase"
import { isPositiveMoney } from "@/lib/money.mjs"
import { inr } from "@/lib/utils"
import type { Frequency, SplitMode } from "@/types"
import { Money, Spotlight } from "@/components/motion"
import { cn } from "@/lib/utils"
import type { RecurringTemplate } from "@/types"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import type { BillingRun } from "@backend/api-contract"

function BillingRunHistory({ template }: { template: RecurringTemplate }) {
  const [open, setOpen] = useState(false)
  const [runs, setRuns] = useState<BillingRun[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!open) return
    setLoading(true)
    void apiRpc<BillingRun[]>("list_recurring_billing_runs", { p_template_id: template.template_id, p_after_run_id: null, p_limit: 25 })
      .then(setRuns).catch(() => toast.error("Could not load billing history."))
      .finally(() => setLoading(false))
  }, [open, template.template_id])
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild><Button variant="ghost" size="icon" aria-label={`Billing history for ${template.title}`}><History /></Button></SheetTrigger>
    <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
      <SheetHeader><SheetTitle>{template.title} billing history</SheetTitle><SheetDescription>Run records are kept for audit. Failed dates stay queued for retry.</SheetDescription></SheetHeader>
      <div className="grid gap-3 px-4 pb-6">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!loading && runs.length === 0 && <p className="text-sm text-muted-foreground">No billing run recorded yet.</p>}
        {runs.map((run) => <div key={run.run_id} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
          <span className="flex-1">{format(parseISO(run.billing_cycle_date), "d MMM yyyy")}</span>
          <Badge variant={run.status === "SUCCESS" ? "secondary" : "destructive"}>{label(run.status)}</Badge>
          {run.error_code && <span className="max-w-40 truncate text-xs text-muted-foreground" title={run.error_code}>{run.error_code}</span>}
        </div>)}
      </div>
    </SheetContent>
  </Sheet>
}

/** Create a recurring bill, or edit `template` when given. */
function BillDialog({ template }: { template?: RecurringTemplate }) {
  const { groups, userName, refresh, me } = useStore()
  const [open, setOpen] = useState(false)
  const keepPeople = useRef(false)
  type BillForm = { group_id: string; title: string; total_amount: string; paid_by: string; split_mode: SplitMode; frequency: Frequency; next_run_date: string }
  const blank = (): BillForm => ({ group_id: groups[0]?.group_id ?? "", title: "", total_amount: "", paid_by: me, split_mode: "EQUAL", frequency: "MONTHLY", next_run_date: "" })
  const [f, setF] = useState(blank)
  const set = (k: keyof BillForm) => (e: any) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }))
  const group = groups.find((g) => g.group_id === f.group_id)
  const [people, setPeople] = useState(group?.members ?? [])
  const [exact, setExact] = useState<Record<string, string>>({})
  useEffect(() => {
    if (keepPeople.current) { keepPeople.current = false; return }
    setPeople(group?.members ?? []); setExact({})
    if (group && !group.members.includes(f.paid_by)) setF((x) => ({ ...x, paid_by: group.members.includes(me) ? me : group.members[0] }))
  }, [f.group_id])

  // Form checks only: income splits need 3+ people; exact shares must add up to the bill.
  const tooFewForIncome = f.split_mode === "INCOME_RATIO" && people.length < 3
  const [saving, setSaving] = useState(false)
  const ok = f.title.trim() && isPositiveMoney(f.total_amount) && (template || f.next_run_date) && people.length > 0 && !tooFewForIncome

  const fill = () => {
    if (!template) return
    keepPeople.current = template.group_id !== f.group_id
    setF({ group_id: template.group_id, title: template.title, total_amount: String(template.total_amount), paid_by: template.paid_by, split_mode: template.split_mode, frequency: template.frequency, next_run_date: template.next_run_date })
    setPeople(template.participants)
    setExact(Object.fromEntries(Object.entries(template.fixed_shares ?? {}).map(([k, v]) => [k, String(v)])))
  }
  const save = async () => {
    if (!ok) return
    setSaving(true)
    try {
      const exactShares = f.split_mode === "EXACT" ? Object.fromEntries(people.map((id) => [id, exact[id] ?? "0.00"])) : undefined
      if (template) {
        await apiRpc("update_recurring_template", {
          p_template_id: template.template_id, p_title: f.title.trim(), p_total_amount: f.total_amount,
          p_split_mode: f.split_mode, p_frequency: f.frequency, p_paid_by: f.paid_by,
          p_participants: people, p_exact_shares: exactShares,
        })
      } else {
        await apiRpc("create_recurring_template", {
          p_group_id: f.group_id, p_title: f.title.trim(), p_total_amount: f.total_amount,
          p_split_mode: f.split_mode, p_frequency: f.frequency, p_start_date: f.next_run_date,
          p_paid_by: f.paid_by, p_participants: people, p_exact_shares: exactShares,
        })
      }
      await refresh()
      toast.success(template ? `${f.title.trim()} updated` : `${f.title.trim()} scheduled ${label(f.frequency).toLowerCase()}`)
      setF(blank()); setOpen(false)
    } catch (error) {
      const code = error instanceof Error ? error.message : "request_failed"
      toast.error(code === "income_setup_required" ? "Every participant needs private income setup for this split." :
        code === "income_split_requires_three_participants" ? "Income splits require at least three participants." :
          code === "template_manager_required" ? "Only the creator, payer or group owner can change this bill." : "Could not save this recurring bill. Check its members and split.")
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (v) fill(); setOpen(v) }}>
      <DialogTrigger asChild>{template
        ? <Button variant="ghost" size="icon" aria-label={`Edit ${template.title}`}><Pencil /></Button>
        : <Button><Plus /> New recurring bill</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{template ? "Edit recurring bill" : "New recurring bill"}</DialogTitle>
          <DialogDescription>Set it up once. It's split and added to balances on every billing date.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel htmlFor="rg">Group</FieldLabel>
              <SimpleSelect id="rg" value={f.group_id} onValueChange={set("group_id")} options={groups.map((g) => ({ value: g.group_id, label: g.group_name }))} /></Field>
            <Field><FieldLabel htmlFor="rp">Paid by</FieldLabel>
              <SimpleSelect id="rp" value={f.paid_by} onValueChange={set("paid_by")} options={(group?.members ?? []).map((id) => ({ value: id, label: userName(id) }))} /></Field>
            <Field><FieldLabel htmlFor="rt">Bill name</FieldLabel><Input id="rt" value={f.title} onChange={set("title")} placeholder="Rent, Wi-Fi, Spotify…" /></Field>
            <Field><FieldLabel htmlFor="ra">Amount</FieldLabel><AmountInput id="ra" value={f.total_amount} onChange={set("total_amount")} /></Field>
            <Field><FieldLabel htmlFor="rf">Repeats</FieldLabel>
              <SimpleSelect id="rf" value={f.frequency} onValueChange={set("frequency")} options={["WEEKLY", "MONTHLY", "YEARLY"].map((x) => ({ value: x, label: label(x) }))} /></Field>
            <Field><FieldLabel htmlFor="rd">{template ? "Next billing date" : "First billing date"}</FieldLabel><DatePicker id="rd" value={f.next_run_date} onChange={set("next_run_date")} disabled={!!template} /></Field>
          </div>
          <Field><FieldLabel>Split</FieldLabel><SplitModeToggle value={f.split_mode} onValueChange={set("split_mode")} /></Field>
          <Field>
            <FieldLabel>Split between</FieldLabel>
            <FieldDescription>Everyone in the group is included unless you remove them.</FieldDescription>
            <PeoplePicker options={group?.members ?? []} value={people} onChange={setPeople} placeholder="Choose people" />
          </Field>
          {f.split_mode === "EXACT" && people.length > 0 && (
            <div className="grid gap-2">
              {people.map((id) => (
                <div key={id} className="flex items-center justify-between gap-3 text-sm">
                  <span>{userName(id)}</span>
                  <AmountInput className="w-32" aria-label={`Share for ${userName(id)}`} value={exact[id] ?? ""} onChange={(e) => setExact((x) => ({ ...x, [id]: e.target.value }))} />
                </div>
              ))}
            </div>
          )}
          {tooFewForIncome && (
            <Alert variant="destructive"><Info /><AlertTitle>Add at least 3 people</AlertTitle><AlertDescription>Income splits need 3 or more people so nobody's income can be worked out.</AlertDescription></Alert>
          )}
          <Alert className="border-info/25 bg-info-soft [&>svg]:text-info"><CalendarClock /><AlertTitle>Billed once per date</AlertTitle><AlertDescription>Each billing date is charged only once, even if the scheduler runs twice.</AlertDescription></Alert>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!ok || saving} onClick={() => void save()}>{saving && <Spinner />}{template ? "Save changes" : "Create bill"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Recurring() {
  const { recurring, refresh, userName, groupName } = useStore()
  const [busy, setBusy] = useState("")
  const toggle = async (template: RecurringTemplate, active: boolean) => {
    setBusy(template.template_id)
    try {
      await apiRpc(active ? "resume_recurring_template" : "pause_recurring_template", { p_template_id: template.template_id })
      await refresh(); toast(active ? `${template.title} resumed` : `${template.title} paused`)
    } catch { toast.error("Could not change this bill. Only its creator, payer or group owner can manage it.") }
    finally { setBusy("") }
  }
  return (
    <>
      <PageHeader title="Recurring bills" description="Rent, Wi-Fi and subscriptions that split themselves." action={<BillDialog />} />
      {recurring.length === 0 ? (
        <Empty>
          <EmptyHeader><EmptyMedia><Repeat /></EmptyMedia><EmptyTitle>No recurring bills</EmptyTitle><EmptyDescription>Add rent or a subscription once and stop re-entering it every month.</EmptyDescription></EmptyHeader>
          <EmptyContent><BillDialog /></EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recurring.map((t) => (
            <Spotlight key={t.template_id}>
            <Card className={cn("h-full", !t.is_active && "opacity-60")}>
              <CardHeader>
                <CardTitle>{t.title}</CardTitle>
                <CardDescription>{groupName(t.group_id)} · paid by {userName(t.paid_by)}</CardDescription>
                <CardAction><Switch checked={t.is_active} disabled={busy === t.template_id} onCheckedChange={(v) => void toggle(t, v)} aria-label={`${t.title} active`} /></CardAction>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="text-2xl font-semibold"><Money value={t.total_amount} /></div>
                <div className="flex flex-wrap gap-2"><Badge variant="secondary">{label(t.frequency)}</Badge><Badge variant="outline">{label(t.split_mode)}</Badge></div>
                <AvatarStack ids={t.participants} />
              </CardContent>
              <CardFooter className="mt-auto justify-between gap-2 text-sm text-muted-foreground">
                <span>{t.is_active ? `Next bill: ${format(parseISO(t.next_run_date), "d MMM yyyy")}` : "Paused"}</span>
                <span className="flex">
                  <BillingRunHistory template={t} />
                  <BillDialog template={t} />
                </span>
              </CardFooter>
              <CardContent className="border-t pt-3 text-xs text-muted-foreground">
                {t.last_success_date && <p>Last added: {format(parseISO(t.last_success_date), "d MMM yyyy")}</p>}
                {(t.backlog_count ?? 0) > 0 && <p>{t.backlog_count} billing date{t.backlog_count === 1 ? "" : "s"} waiting to process.</p>}
                {t.failed_date && <p className="flex items-center gap-1 text-destructive"><CircleAlert className="size-3" /> Failed on {format(parseISO(t.failed_date), "d MMM yyyy")} · {t.last_error_code ?? "needs review"}</p>}
              </CardContent>
            </Card>
            </Spotlight>
          ))}
        </div>
      )}
    </>
  )
}
