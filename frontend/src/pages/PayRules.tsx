import { useEffect, useRef, useState } from "react"
import { Plus, Info, RefreshCw, Workflow, X, ArrowRightLeft } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { PageHeader, StatusBadge } from "@/components/shared"
import { AmountInput, SimpleSelect } from "@/components/form-bits"
import { useStore } from "@/lib/store"
import { apiRpc } from "@/lib/supabase"
import { newRequestId, previewRule, type RulePreview } from "@/lib/api"
import { availableMoney, compareMoney, isPositiveMoney } from "@/lib/money.mjs"
import type { PayWhenPaidRule } from "@/types"
import { inr } from "@/lib/utils"

function useObLabel() {
  const { obligations, userName } = useStore()
  return (id: string) => {
    const obligation = obligations.find((item) => item.obligation_id === id)
    return obligation ? `${userName(obligation.debtor_id)} → ${userName(obligation.creditor_id)} (${inr(obligation.remaining_amount)})` : "Debt unavailable"
  }
}

function NewRuleDialog() {
  const { obligations, me, refresh } = useStore()
  const obLabel = useObLabel()
  const incoming = obligations.filter((item) => item.creditor_id === me && item.status !== "SETTLED")
  const outgoing = obligations.filter((item) => item.debtor_id === me && item.status !== "SETTLED")
  const [open, setOpen] = useState(false)
  const [trigger, setTrigger] = useState("")
  const [target, setTarget] = useState("")
  const [max, setMax] = useState("")
  const [preview, setPreview] = useState<RulePreview | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving, setSaving] = useState(false)
  const requestId = useRef<string | null>(null)

  useEffect(() => { requestId.current = null }, [trigger, target, max])
  useEffect(() => {
    if (!open) return
    setTrigger((current) => incoming.some((item) => item.obligation_id === current) ? current : incoming[0]?.obligation_id ?? "")
    setTarget((current) => outgoing.some((item) => item.obligation_id === current) ? current : outgoing[0]?.obligation_id ?? "")
  }, [open, incoming, outgoing])
  useEffect(() => {
    if (!trigger || !target || !isPositiveMoney(max)) { setPreview(null); return }
    let active = true
    setChecking(true)
    previewRule(trigger, target, max).then((result) => { if (active) setPreview(result) })
      .catch(() => { if (active) setPreview(null) })
      .finally(() => { if (active) setChecking(false) })
    return () => { active = false }
  }, [trigger, target, max])

  const targetObligation = outgoing.find((item) => item.obligation_id === target)
  const tooMuch = !!targetObligation && compareMoney(max, targetObligation.remaining_amount) === 1
  const available = targetObligation ? availableMoney(targetObligation.remaining_amount, targetObligation.reserved_amount) : "0.00"
  const save = async () => {
    if (!trigger || !target || !isPositiveMoney(max) || tooMuch) return
    setSaving(true)
    requestId.current ??= newRequestId()
    try {
      await apiRpc("create_pay_when_paid_rule", {
        p_trigger_obligation_id: trigger, p_target_obligation_id: target,
        p_max_amount: max, p_request_id: requestId.current,
      })
      await refresh()
      toast.success("Rule armed", { description: "Confirmed receipts can create forwarding tasks. Each payment still needs creditor confirmation." })
      setOpen(false); setMax(""); requestId.current = null
    } catch (error) {
      toast.error(error instanceof Error && error.message === "rule_party_relationship_required"
        ? "Choose a debt you are owed and one you owe to the same person."
        : "Could not save this rule. Check both debts and try again.")
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> New rule</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay when paid</DialogTitle>
          <DialogDescription>When a creditor confirms they paid you, NoBroke can create a task for money you owe. You make that payment outside the app.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field><FieldLabel htmlFor="trig">When this debt is confirmed paid to me</FieldLabel>
            <SimpleSelect id="trig" value={trigger} onValueChange={setTrigger} placeholder="No open receivables" options={incoming.map((item) => ({ value: item.obligation_id, label: obLabel(item.obligation_id) }))} />
          </Field>
          <Field><FieldLabel htmlFor="targ">Create a task for this debt</FieldLabel>
            <SimpleSelect id="targ" value={target} onValueChange={setTarget} placeholder="No open payables" options={outgoing.map((item) => ({ value: item.obligation_id, label: obLabel(item.obligation_id) }))} />
          </Field>
          <Field data-invalid={tooMuch || undefined}>
            <FieldLabel htmlFor="max">Maximum amount</FieldLabel>
            <AmountInput id="max" value={max} onChange={(event) => setMax(event.target.value)} aria-invalid={tooMuch || undefined} />
            {tooMuch ? <FieldError>You owe {inr(targetObligation.remaining_amount)} on this debt.</FieldError>
              : targetObligation && <FieldDescription>Available debt: {inr(available)} after existing payment reservations.</FieldDescription>}
          </Field>
        </FieldGroup>
        {checking && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Checking for a closed cycle…</div>}
        {!checking && preview?.creates_cycle && <Alert><RefreshCw /><AlertTitle>This closes a debt cycle</AlertTitle>
          <AlertDescription>Arming this rule nets {inr(preview.cycle_net_amount)} from the closed cycle. Cycle netting clears ledger debt and moves no cash.</AlertDescription></Alert>}
        <Alert><Info /><AlertTitle>Payments still need confirmation</AlertTitle>
          <AlertDescription>A confirmed incoming payment can create a forwarding task. The debtor reports the outside payment; the next creditor confirms receipt before that debt changes.</AlertDescription></Alert>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!trigger || !target || !isPositiveMoney(max) || tooMuch || checking || saving} onClick={() => void save()}>{saving && <Spinner />} Arm rule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function PayRules() {
  const { rules, forwardingTasks, obligations, batches, userName, refresh, me } = useStore()
  const obLabel = useObLabel()
  const [cancelling, setCancelling] = useState<PayWhenPaidRule | null>(null)
  const [busy, setBusy] = useState("")
  const act = async (work: () => Promise<unknown>, success: string) => {
    setBusy(success)
    try { await work(); await refresh(); toast.success(success) }
    catch { toast.error("The request could not be completed. Refresh and try again.") }
    finally { setBusy("") }
  }
  const reportTask = async (taskId: string, amount: string) => act(() => apiRpc("report_task_payment", {
    p_task_id: taskId, p_amount: amount, p_request_id: newRequestId(),
  }), "Payment reported; awaiting creditor confirmation")

  return (
    <>
      <PageHeader title="Pay-when-paid" description="Confirmed receipts can create forwarding tasks. Each outside payment needs receipt confirmation." action={<NewRuleDialog />} />
      {rules.length === 0 ? <Empty>
        <EmptyHeader><EmptyMedia><Workflow /></EmptyMedia><EmptyTitle>No rules yet</EmptyTitle><EmptyDescription>Make a task for an amount you owe when a related incoming payment is confirmed.</EmptyDescription></EmptyHeader>
        <EmptyContent><NewRuleDialog /></EmptyContent>
      </Empty> : <Card><CardContent><Table>
        <TableHeader><TableRow><TableHead>When this is confirmed</TableHead><TableHead>Create task for</TableHead><TableHead>Limit</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{rules.map((rule) => <TableRow key={rule.rule_id}>
          <TableCell>{obLabel(rule.trigger_receivable_id)}</TableCell><TableCell>{obLabel(rule.target_payable_id)}</TableCell>
          <TableCell className="tabular-nums">{inr(rule.max_cascade_amount)}</TableCell><TableCell><StatusBadge status={rule.status} /></TableCell>
          <TableCell className="text-right">{rule.status === "ARMED" && <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => setCancelling(rule)}><X /> Cancel</Button>}</TableCell>
        </TableRow>)}</TableBody>
      </Table></CardContent></Card>}

      <Card>
        <CardHeader><CardTitle>Forwarding tasks</CardTitle><CardDescription>A task reserves part of a debt. Reporting an outside payment moves it to the creditor for confirmation.</CardDescription></CardHeader>
        <CardContent><Table>
          <TableHeader><TableRow><TableHead>Debt</TableHead><TableHead>Task amount left</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{forwardingTasks.map((task) => {
            const obligation = obligations.find((item) => item.obligation_id === task.target_obligation_id)
            return <TableRow key={task.task_id}>
              <TableCell>{task.expense_title} · {obligation ? `${userName(obligation.debtor_id)} → ${userName(obligation.creditor_id)}` : ""}</TableCell>
              <TableCell className="tabular-nums">{inr(task.remaining_amount)}</TableCell><TableCell><StatusBadge status={task.status} /></TableCell>
              <TableCell className="text-right">{obligation?.debtor_id === me && task.status === "PENDING" && isPositiveMoney(task.remaining_amount) &&
                <Button size="sm" disabled={!!busy} onClick={() => void reportTask(task.task_id, task.remaining_amount)}>I paid outside NoBroke</Button>}</TableCell>
            </TableRow>
          })}</TableBody>
        </Table>{forwardingTasks.length === 0 && <p className="py-4 text-sm text-muted-foreground">No forwarding tasks yet.</p>}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cycle netting</CardTitle><CardDescription>Armed, consenting rules can clear closed cycles in PostgreSQL. No cash changes hands.</CardDescription></CardHeader>
        <CardContent>{batches.filter((batch) => batch.settlement_type === "CYCLE_CLEAR").length === 0
          ? <p className="text-sm text-muted-foreground">No cycle netting recorded.</p>
          : <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Record</TableHead><TableHead className="text-right">Net amount</TableHead></TableRow></TableHeader><TableBody>
            {batches.filter((batch) => batch.settlement_type === "CYCLE_CLEAR").map((batch) => <TableRow key={batch.batch_id}>
              <TableCell>{batch.executed_at}</TableCell><TableCell><span className="inline-flex items-center gap-2"><ArrowRightLeft className="size-4" /> Cycle net · no cash</span></TableCell>
              <TableCell className="text-right tabular-nums">{inr(batch.total_cleared)}</TableCell>
            </TableRow>)}
          </TableBody></Table>}</CardContent>
      </Card>

      <AlertDialog open={!!cancelling} onOpenChange={(value) => !value && setCancelling(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancel this rule?</AlertDialogTitle>
          <AlertDialogDescription>Future receipts will no longer create tasks from this rule. Existing tasks remain; unreported tasks may be cancelled by the server when eligible.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep rule</AlertDialogCancel>
            <AlertDialogAction disabled={!!busy} onClick={() => {
              if (!cancelling) return
              void act(() => apiRpc("cancel_pay_when_paid_rule", { p_rule_id: cancelling.rule_id }), "Rule cancelled")
              setCancelling(null)
            }}>Cancel rule</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
