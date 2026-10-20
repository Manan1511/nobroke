import { useEffect, useRef, useState } from "react"
import { Plus, Info, CalendarClock, Repeat, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { format, parseISO } from "date-fns"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { PageHeader, AvatarStack, label } from "@/components/shared"
import { AmountInput, DatePicker, PeoplePicker, SimpleSelect, SplitModeToggle } from "@/components/form-bits"
import { useStore, newId } from "@/lib/store"
import { inr } from "@/lib/utils"
import type { Frequency, SplitMode } from "@/types"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { Money, Spotlight } from "@/components/motion"
import { cn } from "@/lib/utils"
import type { RecurringTemplate } from "@/types"

/** Create a recurring bill, or edit `template` when given. */
function BillDialog({ template }: { template?: RecurringTemplate }) {
  const { groups, userName, update, me } = useStore()
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
  const exactSum = people.reduce((s, id) => s + (Number(exact[id]) || 0), 0)
  const exactMismatch = f.split_mode === "EXACT" && Number(f.total_amount) > 0 && Math.abs(exactSum - Number(f.total_amount)) > 0.001
  const ok = f.title.trim() && Number(f.total_amount) > 0 && f.next_run_date && people.length > 0 && !tooFewForIncome && !exactMismatch

  const fill = () => {
    if (!template) return
    keepPeople.current = template.group_id !== f.group_id
    setF({ group_id: template.group_id, title: template.title, total_amount: String(template.total_amount), paid_by: template.paid_by, split_mode: template.split_mode, frequency: template.frequency, next_run_date: template.next_run_date })
    setPeople(template.participants)
    setExact(Object.fromEntries(Object.entries(template.fixed_shares ?? {}).map(([k, v]) => [k, String(v)])))
  }
  const save = () => {
    if (template) {
      const changed: RecurringTemplate = { ...template, ...f, title: f.title.trim(), total_amount: Number(f.total_amount), participants: people, fixed_shares: f.split_mode === "EXACT" ? exact : undefined }
      update("recurring", (r) => r.map((x) => (x.template_id === template.template_id ? changed : x)))
      toast.success(`${f.title.trim()} updated`); setOpen(false); return
    }
    update("recurring", (r) => [...r, { ...f, title: f.title.trim(), template_id: newId("t"), total_amount: Number(f.total_amount), is_active: true, participants: people, ...(f.split_mode === "EXACT" && { fixed_shares: exact }) }])
    toast.success(`${f.title.trim()} will be billed ${label(f.frequency).toLowerCase()}`)
    setF(blank()); setOpen(false)
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
            <Field><FieldLabel htmlFor="rd">First billing date</FieldLabel><DatePicker id="rd" value={f.next_run_date} onChange={set("next_run_date")} /></Field>
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
          {exactMismatch && (
            <Alert variant="destructive"><Info /><AlertTitle>Amounts don't add up</AlertTitle><AlertDescription>The shares total {inr(exactSum)}, but the bill is {inr(f.total_amount)}.</AlertDescription></Alert>
          )}
          {tooFewForIncome && (
            <Alert variant="destructive"><Info /><AlertTitle>Add at least 3 people</AlertTitle><AlertDescription>Income splits need 3 or more people so nobody's income can be worked out.</AlertDescription></Alert>
          )}
          <Alert className="border-info/25 bg-info-soft [&>svg]:text-info"><CalendarClock /><AlertTitle>Billed once per date</AlertTitle><AlertDescription>Each billing date is charged only once, even if the scheduler runs twice.</AlertDescription></Alert>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!ok} onClick={save}>{template ? "Save changes" : "Create bill"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Recurring() {
  const { recurring, update, userName, groupName } = useStore()
  const toggle = (t: RecurringTemplate, v: boolean) => {
    update("recurring", (r) => r.map((x) => (x.template_id === t.template_id ? { ...x, is_active: v } : x)))
    toast(v ? `${t.title} resumed` : `${t.title} paused`)
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
                <CardAction><Switch checked={t.is_active} onCheckedChange={(v) => toggle(t, v)} aria-label={`${t.title} active`} /></CardAction>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="text-2xl font-semibold"><Money value={t.total_amount} /></div>
                <div className="flex flex-wrap gap-2"><Badge variant="secondary">{label(t.frequency)}</Badge><Badge variant="outline">{label(t.split_mode)}</Badge></div>
                <AvatarStack ids={t.participants} />
              </CardContent>
              <CardFooter className="mt-auto justify-between gap-2 text-sm text-muted-foreground">
                <span>{t.is_active ? `Next bill: ${format(parseISO(t.next_run_date), "d MMM yyyy")}` : "Paused"}</span>
                <span className="flex">
                  <BillDialog template={t} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon" aria-label={`Delete ${t.title}`}><Trash2 /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete "{t.title}"?</AlertDialogTitle><AlertDialogDescription>No new bills will be added. Bills already split stay as they are.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-primary-foreground hover:bg-destructive/90" onClick={() => { update("recurring", (r) => r.filter((x) => x.template_id !== t.template_id)); toast.success(`${t.title} deleted`) }}>Delete bill</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </span>
              </CardFooter>
            </Card>
            </Spotlight>
          ))}
        </div>
      )}
    </>
  )
}
