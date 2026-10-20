import { useEffect, useState } from "react"
import { Plus, Info, RefreshCw, Workflow, X } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty"
import { PageHeader, StatusBadge } from "@/components/shared"
import { useStore, newId } from "@/lib/store"
import { previewRule } from "@/lib/api"
import { inr } from "@/lib/utils"

function useObLabel() {
  const { obligations, userName } = useStore()
  return (id) => {
    const o = obligations.find((x) => x.obligation_id === id)
    return o ? `${userName(o.debtor_id)} → ${userName(o.creditor_id)} (${inr(o.remaining_amount)})` : "—"
  }
}

function NewRuleDialog() {
  const { obligations, update, me } = useStore()
  const obLabel = useObLabel()
  const incoming = obligations.filter((o) => o.creditor_id === me && o.status !== "SETTLED")
  const outgoing = obligations.filter((o) => o.debtor_id === me && o.status !== "SETTLED")
  const [open, setOpen] = useState(false)
  const [trigger, setTrigger] = useState(incoming[0]?.obligation_id ?? "")
  const [target, setTarget] = useState(outgoing[0]?.obligation_id ?? "")
  const [max, setMax] = useState("")
  const [preview, setPreview] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!trigger || !target) return
    setChecking(true)
    previewRule(trigger, target).then((p) => { setPreview(p); setChecking(false) })
  }, [trigger, target])

  const save = () => {
    update("rules", (r) => [{ rule_id: newId("r"), trigger_receivable_id: trigger, target_payable_id: target, max_cascade_amount: Number(max), status: "ARMED", created_at: new Date().toISOString().slice(0, 10) }, ...r])
    toast.success(preview?.creates_loop ? "Rule saved and loop cleared" : "Rule saved", { description: preview?.creates_loop ? `${inr(preview.loop_amount)} was cancelled out right away.` : "It'll run when the money comes in." })
    setOpen(false); setMax("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button><Plus /> New rule</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay when paid</DialogTitle>
          <DialogDescription>When someone pays you, pass that money straight on to someone you owe.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="trig">When this is paid to me</Label>
          <NativeSelect id="trig" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
            {incoming.map((o) => <NativeSelectOption key={o.obligation_id} value={o.obligation_id}>{obLabel(o.obligation_id)}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="targ">Pay this debt</Label>
          <NativeSelect id="targ" value={target} onChange={(e) => setTarget(e.target.value)}>
            {outgoing.map((o) => <NativeSelectOption key={o.obligation_id} value={o.obligation_id}>{obLabel(o.obligation_id)}</NativeSelectOption>)}
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="max">Pass on at most (₹)</Label>
          <Input id="max" type="number" min="0" step="0.01" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>

        {checking && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Checking for loops…</div>}
        {!checking && preview?.creates_loop && (
          <Alert>
            <RefreshCw />
            <AlertTitle>This closes a loop</AlertTitle>
            <AlertDescription>The people in this chain are all waiting on each other. Saving clears {inr(preview.loop_amount)} for everyone right away, with no cash needed.</AlertDescription>
          </Alert>
        )}
        <Alert>
          <Info />
          <AlertTitle>Partial payments</AlertTitle>
          <AlertDescription>If only part of the money comes in, the same share is passed on. The rest waits for the next payment.</AlertDescription>
        </Alert>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!trigger || !target || !(Number(max) > 0) || checking} onClick={save}>Save rule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function PayRules() {
  const { rules, update } = useStore()
  const obLabel = useObLabel()
  const [cancelling, setCancelling] = useState(null)

  return (
    <>
      <PageHeader title="Pay-when-paid" description="Rules that forward money automatically as it comes in." action={<NewRuleDialog />} />
      {rules.length === 0 ? (
        <Empty>
          <EmptyHeader><EmptyMedia><Workflow /></EmptyMedia><EmptyTitle>No rules yet</EmptyTitle><EmptyDescription>Set one up so you never have to pay out of pocket while waiting on someone else.</EmptyDescription></EmptyHeader>
          <EmptyContent><NewRuleDialog /></EmptyContent>
        </Empty>
      ) : (
        <Card><CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>When this is paid</TableHead><TableHead>Pay this</TableHead><TableHead>Up to</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.rule_id}>
                  <TableCell>{obLabel(r.trigger_receivable_id)}</TableCell>
                  <TableCell>{obLabel(r.target_payable_id)}</TableCell>
                  <TableCell className="tabular-nums">{inr(r.max_cascade_amount)}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right">
                    {r.status === "ARMED" && <Button variant="ghost" size="sm" onClick={() => setCancelling(r)}><X /> Cancel</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
      <AlertDialog open={!!cancelling} onOpenChange={(v) => !v && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this rule?</AlertDialogTitle>
            <AlertDialogDescription>Money you receive will stay with you. You'll need to pay the other debt yourself.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep rule</AlertDialogCancel>
            <AlertDialogAction onClick={() => { update("rules", (rs) => rs.map((x) => (x.rule_id === cancelling.rule_id ? { ...x, status: "CANCELLED" } : x))); toast("Rule cancelled") }}>Cancel rule</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
