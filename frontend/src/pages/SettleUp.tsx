import { useEffect, useRef, useState } from "react"
import { ArrowRight, Route, TriangleAlert, CircleCheck, Banknote, Check, X } from "lucide-react"
import { toast } from "sonner"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { PageHeader, UserAvatar, label, StatusBadge } from "@/components/shared"
import { PersonHover, SimpleSelect } from "@/components/form-bits"
import { useStore } from "@/lib/store"
import { executeRoute, newRequestId, previewRoute } from "@/lib/api"
import { apiRpc } from "@/lib/supabase"
import { resolveSelectedObligation } from "@/lib/selection"
import { availableMoney, compareMoney, isPositiveMoney } from "@/lib/money.mjs"
import type { RoutePreview } from "@backend/api-contract"
import { inr } from "@/lib/utils"

function RoutePath({ path }: { path: string[] }) {
  const { userName } = useStore()
  return <div className="flex flex-wrap items-center gap-2">
    {path.map((id, index) => <span key={`${id}-${index}`} className="flex items-center gap-2">
      <span className="flex items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3 text-sm"><UserAvatar id={id} className="size-6" /><PersonHover id={id}>{userName(id)}</PersonHover></span>
      {index < path.length - 1 && <ArrowRight className="size-4 text-muted-foreground" />}
    </span>)}
  </div>
}

export default function SettleUp() {
  const { obligations, batches, payments, userName, refresh, me } = useStore()
  const mine = obligations.filter((item) => item.debtor_id === me && item.status !== "SETTLED")
  const [selected, setSelected] = useState("")
  const [amount, setAmount] = useState("")
  const [route, setRoute] = useState<RoutePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState("")
  const requestId = useRef<string | null>(null)
  const selectedObligationId = resolveSelectedObligation(selected, mine.map((item) => item.obligation_id))
  const obligation = mine.find((item) => item.obligation_id === selectedObligationId)
  const available = obligation ? availableMoney(obligation.remaining_amount, obligation.reserved_amount) : "0.00"
  const amountWithinAvailable = isPositiveMoney(amount) && compareMoney(amount, available) !== 1
  const pendingPayments = payments.filter((payment) => payment.status === "PENDING" && (payment.debtor_id === me || payment.creditor_id === me))

  useEffect(() => { setRoute(null); setAmount(""); requestId.current = null }, [selectedObligationId])
  useEffect(() => { requestId.current = null }, [amount])

  const runPaymentAction = async (paymentId: string, action: "confirm_payment" | "reject_payment" | "cancel_payment") => {
    setBusy(paymentId)
    try { await apiRpc(action, { p_payment_id: paymentId }); await refresh(); toast.success(action === "confirm_payment" ? "Receipt confirmed; debt updated" : action === "reject_payment" ? "Payment report rejected" : "Payment report cancelled") }
    catch { toast.error("Could not update this payment report.") }
    finally { setBusy("") }
  }

  const report = async () => {
    if (!obligation || !isPositiveMoney(amount)) return
    requestId.current ??= newRequestId()
    setBusy("report")
    try {
      await apiRpc("report_payment", { p_obligation_id: obligation.obligation_id, p_amount: amount, p_request_id: requestId.current })
      await refresh(); toast.success("Payment reported", { description: "The creditor must confirm receipt before this debt changes." })
      setAmount(""); requestId.current = null
    } catch { toast.error("Could not report that amount. Check the unreserved balance and try again.") }
    finally { setBusy("") }
  }

  const search = async () => {
    if (!obligation || !isPositiveMoney(amount)) return
    setLoading(true)
    try { setRoute(await previewRoute(obligation.obligation_id, amount)) }
    catch { setRoute(null); toast.error("No eligible route was found, or a related payment or rule is still active.") }
    finally { setLoading(false) }
  }

  const execute = async () => {
    if (!route) return
    setBusy("route")
    try {
      await executeRoute(route.preview_id)
      await refresh(); setRoute(null); toast.success("Debt routed", { description: "The ledger changed. No external payment was recorded." })
    } catch (error) {
      const code = error instanceof Error ? error.message : "request_failed"
      toast.error(code === "stale_route_preview" ? "Balances or trust changed. Request a fresh route preview." : "Could not execute this route.")
      setRoute(null)
    } finally { setBusy("") }
  }

  return <>
    <PageHeader title="Settle up" description="Report outside payments for receipt confirmation, or preview a debt route. Routing moves no cash." />
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Report an outside payment</CardTitle><CardDescription>Pay the creditor outside NoBroke, then report it here. The balance changes only after they confirm receipt.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          {mine.length === 0 ? <p className="text-sm text-muted-foreground">You have no open debts to report.</p> : <>
            <Field><FieldLabel htmlFor="debt">Debt</FieldLabel>
              <SimpleSelect id="debt" value={selectedObligationId} onValueChange={setSelected}
                options={mine.map((item) => ({ value: item.obligation_id, label: `${userName(item.creditor_id)} · ${inr(item.remaining_amount)} · ${item.source}` }))} />
            </Field>
            <Field><FieldLabel htmlFor="payment-amount">Amount paid (available {inr(available)})</FieldLabel>
              <Input id="payment-amount" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" /></Field>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!obligation || !amountWithinAvailable || !!busy} onClick={() => void report()}>{busy === "report" && <Spinner />}<Banknote /> I paid outside NoBroke</Button>
              <Button variant="outline" disabled={!obligation || !amountWithinAvailable || loading || !!busy} onClick={() => void search()}>{loading ? <Spinner /> : <Route />} Preview debt route</Button>
            </div>
          </>}
          {route && <div className="grid gap-3 rounded-xl border p-4">
            <div className="flex items-center justify-between"><Badge variant="secondary">Debt reallocation</Badge><span className="text-sm tabular-nums">{inr(route.amount)}</span></div>
            <RoutePath path={route.path} />
            <Alert><TriangleAlert /><AlertTitle>This is not a payment</AlertTitle><AlertDescription>Executing this route changes who owes whom inside NoBroke. It does not move money or mark an outside payment as received.</AlertDescription></Alert>
            <AlertDialog>
              <AlertDialogTrigger asChild><Button disabled={!!busy}>Execute this route</Button></AlertDialogTrigger>
              <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reallocate this debt?</AlertDialogTitle>
                <AlertDialogDescription>The preview expires at {new Date(route.expires_at).toLocaleTimeString()}. If a balance or trust limit changed, the server will reject it and require a new preview.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Go back</AlertDialogCancel><AlertDialogAction disabled={!!busy} onClick={() => void execute()}>{busy === "route" && <Spinner />} Reallocate debt</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payment reports awaiting action</CardTitle><CardDescription>Only creditor confirmation reduces debt. Debtors may cancel before that confirmation.</CardDescription></CardHeader>
        <CardContent className="grid gap-3">
          {pendingPayments.length === 0 && <p className="text-sm text-muted-foreground">Nothing needs confirmation.</p>}
          {pendingPayments.map((payment) => <div key={payment.payment_id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
            <div className="min-w-0 flex-1"><div className="text-sm font-medium">{userName(payment.debtor_id)} → {userName(payment.creditor_id)}</div>
              <div className="text-xs text-muted-foreground">{inr(payment.amount)} · awaiting creditor confirmation</div></div>
            {payment.creditor_id === me && <>
              <Button size="sm" disabled={!!busy} onClick={() => void runPaymentAction(payment.payment_id, "confirm_payment")}><Check /> Confirm receipt</Button>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void runPaymentAction(payment.payment_id, "reject_payment")}><X /> Reject</Button>
            </>}
            {payment.debtor_id === me && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void runPaymentAction(payment.payment_id, "cancel_payment")}>Cancel report</Button>}
          </div>)}
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader><CardTitle>Confirmed settlement history</CardTitle><CardDescription>Confirmed outside payments, debt routes and cycle netting remain distinct ledger events.</CardDescription></CardHeader>
      <CardContent><ScrollArea className="h-64 pr-3"><Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Event</TableHead><TableHead>People</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
        <TableBody>{batches.map((batch) => <TableRow key={batch.batch_id}>
          <TableCell className="text-muted-foreground">{batch.executed_at}</TableCell><TableCell><Badge variant="outline">{label(batch.settlement_type)}</Badge></TableCell>
          <TableCell className="whitespace-normal">{batch.legs.length ? batch.legs.map((leg) => `${userName(leg.from_user)} → ${userName(leg.to_user)}`).join(", ") : "Cycle net · no cash"}</TableCell>
          <TableCell className="text-right tabular-nums">{inr(batch.total_cleared)}</TableCell>
        </TableRow>)}</TableBody>
      </Table>{batches.length === 0 && <p className="py-4 text-sm text-muted-foreground">No confirmed events yet.</p>}</ScrollArea></CardContent>
    </Card>

    <Card><CardHeader><CardTitle>How it works</CardTitle></CardHeader><CardContent>
      <Accordion type="single" collapsible>
        <AccordionItem value="payment"><AccordionTrigger>When does a payment change my balance?</AccordionTrigger><AccordionContent>The debtor reports a payment made outside NoBroke. The creditor confirms receipt. Until confirmation, the amount stays reserved and the debt remains visible.</AccordionContent></AccordionItem>
        <AccordionItem value="route"><AccordionTrigger>What does a route do?</AccordionTrigger><AccordionContent>A route reallocates debt through a consenting friend. It records no cash movement and does not replace reporting an outside payment.</AccordionContent></AccordionItem>
        <AccordionItem value="cycle"><AccordionTrigger>What is cycle netting?</AccordionTrigger><AccordionContent>Armed rules can net the shared amount in a closed debt cycle. That changes ledger obligations without anyone paying money.</AccordionContent></AccordionItem>
      </Accordion>
    </CardContent></Card>
  </>
}
