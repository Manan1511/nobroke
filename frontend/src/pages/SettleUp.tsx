import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowRight, Route, TriangleAlert, CircleCheck, Banknote, Check, X, Bell } from "lucide-react"
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
import { findRemindableReceivable, individualPaymentTargets, netPosition, onePaymentTargetPerPeer } from "@/lib/net-position.mjs"
import { listAllPages } from "@/lib/pagination.mjs"
import { canAcceptGlobalSettlementPlan, canCancelGlobalSettlementPlan, canDeclineGlobalSettlementPlan, globalTransferActions, hasOpenGlobalSettlementPreview, visibleGlobalSettlementHistory } from "@/lib/global-settlement-display.mjs"
import type { GlobalSettlementHistoryItem, GlobalSettlementPlan, RoutePreview } from "@backend/api-contract"
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

function globalStatusLabel(status: string, expiresAt?: string) {
  if (status === "PREVIEW" && expiresAt && Date.parse(expiresAt) <= Date.now()) return "Expired preview"
  const labels: Record<string, string> = {
    PREVIEW: "Preview",
    ACCEPTED: "Ready to pay",
    PARTIAL: "Partly complete",
    COMPLETED: "Completed",
    EXPIRED: "Expired",
    PLANNED: "Awaiting acceptance",
    PENDING: "Awaiting receipt",
    CONFIRMED: "Confirmed",
    REJECTED: "Rejected",
    CANCELLED: "Cancelled",
  }
  return labels[status] ?? label(status)
}

export default function SettleUp() {
  const { obligations, dashboardBalances, batches, payments, userName, refresh, me, globalNettingEnabled, friendships } = useStore()
  const netByPeer = new Map(dashboardBalances.map((balance) => [balance.user_id, netPosition(balance)]))
  const balanceByPeer = new Map(dashboardBalances.map((balance) => [balance.user_id, balance]))
  const openDebts = obligations.filter((item) => item.debtor_id === me && item.status !== "SETTLED")
  const amountAvailableFor = (item: typeof obligations[number]) => {
    const unreservedDebt = availableMoney(item.remaining_amount, item.reserved_amount)
    const netAvailable = balanceByPeer.get(item.creditor_id)?.available_to_pay ?? "0.00"
    return compareMoney(unreservedDebt, netAvailable) === 1 ? netAvailable : unreservedDebt
  }
  const individualAmountAvailableFor = (item: typeof obligations[number]) => availableMoney(item.remaining_amount, item.reserved_amount)
  const mine = openDebts.filter((item) => netByPeer.get(item.creditor_id)?.direction === "YOU_OWE" && isPositiveMoney(amountAvailableFor(item)))
  const netPaymentTargets = onePaymentTargetPerPeer(mine, amountAvailableFor)
  const individualTargets = individualPaymentTargets(openDebts, individualAmountAvailableFor)
  const netPositions = dashboardBalances.map(netPosition).filter((position): position is NonNullable<ReturnType<typeof netPosition>> => position !== null)
  const [selected, setSelected] = useState("")
  const [paymentMode, setPaymentMode] = useState<"net" | "individual">("net")
  const [amount, setAmount] = useState("")
  const [reminding, setReminding] = useState("")
  const [route, setRoute] = useState<RoutePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState("")
  const [globalPlans, setGlobalPlans] = useState<GlobalSettlementPlan[]>([])
  const [globalHistory, setGlobalHistory] = useState<GlobalSettlementHistoryItem[]>([])
  const [globalLoading, setGlobalLoading] = useState(true)
  const [globalLoadError, setGlobalLoadError] = useState<"failed" | "unavailable" | null>(null)
  const globalReportIds = useRef(new Map<string, string>())
  const requestId = useRef<string | null>(null)
  const previewRequestId = useRef<string | null>(null)
  const previewInFlight = useRef(false)
  const hasOpenPreview = hasOpenGlobalSettlementPreview(globalPlans)
  const paymentTargets = paymentMode === "net" ? netPaymentTargets : individualTargets
  const availableForTarget = paymentMode === "net" ? amountAvailableFor : individualAmountAvailableFor
  const selectedObligationId = resolveSelectedObligation(selected, paymentTargets.map((item) => item.obligation_id))
  const obligation = paymentTargets.find((item) => item.obligation_id === selectedObligationId)
  const available = obligation ? availableForTarget(obligation) : "0.00"
  const amountWithinAvailable = isPositiveMoney(amount) && compareMoney(amount, available) !== 1
  const pendingPayments = payments.filter((payment) => payment.status === "PENDING" && (payment.debtor_id === me || payment.creditor_id === me))
  const friendshipStateKey = friendships.map((friendship) => `${friendship.friendship_id}:${friendship.status}`).join("|")

  const remind = async (debtorId: string) => {
    const target = findRemindableReceivable(obligations, me, debtorId)
    if (!target) return
    setReminding(debtorId)
    try {
      await apiRpc("remind_debtor", { p_obligation_id: target.obligation_id })
      await refresh()
      toast.success(`Reminder sent to ${userName(debtorId)}`)
    } catch (error) {
      toast.error(error instanceof Error && error.message === "reminder_cooldown_active"
        ? "A reminder was already sent in the last 24 hours."
        : "Could not send this reminder.")
    } finally { setReminding("") }
  }

  const refreshGlobal = useCallback(async () => {
    if (!me) return
    setGlobalLoading(true)
    try {
      const [plans, history] = await Promise.all([
        listAllPages<GlobalSettlementPlan>(
          (args) => apiRpc<GlobalSettlementPlan[]>("list_global_settlement_plans", args),
          {},
          { idField: "plan_id", idArg: "p_after_plan_id", timestampField: "created_at", timestampArg: "p_after_created_at" },
        ),
        listAllPages<GlobalSettlementHistoryItem>(
          (args) => apiRpc<GlobalSettlementHistoryItem[]>("list_global_settlement_history", args),
          {},
          { idField: "transfer_id", idArg: "p_after_transfer_id", timestampField: "created_at", timestampArg: "p_after_created_at" },
        ),
      ])
      setGlobalPlans((plans ?? []).filter((plan) => plan.status !== "CANCELLED"))
      setGlobalHistory(visibleGlobalSettlementHistory(history))
      setGlobalLoadError(null)
    } catch (error) {
      setGlobalLoadError(error instanceof Error && error.message === "api_function_unavailable" ? "unavailable" : "failed")
    } finally { setGlobalLoading(false) }
  }, [me])

  useEffect(() => { void refreshGlobal() }, [refreshGlobal, friendshipStateKey])

  const upsertGlobalPlan = (plan: GlobalSettlementPlan) => setGlobalPlans((current) => plan.status === "CANCELLED"
    ? current.filter((item) => item.plan_id !== plan.plan_id)
    : [plan, ...current.filter((item) => item.plan_id !== plan.plan_id)])

  const previewGlobal = async () => {
    if (previewInFlight.current || hasOpenGlobalSettlementPreview(globalPlans)) return
    previewInFlight.current = true
    setBusy("global-preview")
    try {
      previewRequestId.current ??= newRequestId()
      const plan = await apiRpc<GlobalSettlementPlan>("preview_global_settlement", { p_request_id: previewRequestId.current })
      previewRequestId.current = null
      upsertGlobalPlan(plan)
      toast.success("Global friend plan ready", { description: "Review each transfer and its source debts before accepting." })
    } catch (error) {
      const code = error instanceof Error ? error.message : "request_failed"
      toast.error(code === "global_netting_disabled"
        ? "Turn on Global friend netting in Friends & trust to preview a plan."
        : code === "global_settlement_no_eligible_debts"
          ? "No eligible friend debts found. Friends must be active and have global netting enabled."
          : code === "global_settlement_no_payment_required"
          ? "No outside payment is required for this cycle. No debt was changed."
          : "Could not preview a global friend plan. Check your friends’ global netting settings and try again.")
    } finally { previewInFlight.current = false; setBusy("") }
  }

  const acceptGlobalPlan = async (plan: GlobalSettlementPlan) => {
    setBusy(plan.plan_id)
    try {
      const updated = await apiRpc<GlobalSettlementPlan>("accept_global_settlement_plan", { p_plan_id: plan.plan_id })
      upsertGlobalPlan(updated)
      await refresh()
      toast.success("Plan accepted", { description: "Its source debts are reserved. Balances change after each recipient confirms payment." })
    } catch (error) {
      const code = error instanceof Error ? error.message : "request_failed"
      toast.error(code === "stale_global_settlement_preview"
        ? "Balances or global netting settings changed. Preview a fresh plan before paying."
        : "Could not accept this plan.")
    } finally { setBusy("") }
  }

  const dismissGlobalPlan = async (plan: GlobalSettlementPlan) => {
    const isCreator = plan.created_by === me
    setBusy(plan.plan_id)
    try {
      const updated = await apiRpc<GlobalSettlementPlan>("cancel_global_settlement_plan", { p_plan_id: plan.plan_id })
      upsertGlobalPlan(updated)
      await refreshGlobal()
      toast.success(isCreator ? "Preview cancelled" : "Plan declined", {
        description: "No balances changed. You can create a fresh preview later.",
      })
    } catch (error) {
      const code = error instanceof Error ? error.message : "request_failed"
      toast.error(code === "global_settlement_plan_unavailable"
        ? "This plan is no longer awaiting a response. Refresh to see its latest status."
        : "Could not cancel this plan.")
    } finally { setBusy("") }
  }

  const runGlobalAction = async (plan: GlobalSettlementPlan, transferId: string,
    action: "report" | "confirm" | "reject" | "cancel") => {
    setBusy(transferId)
    try {
      let updated: GlobalSettlementPlan
      if (action === "report") {
        const requestId = globalReportIds.current.get(transferId) ?? newRequestId()
        globalReportIds.current.set(transferId, requestId)
        updated = await apiRpc<GlobalSettlementPlan>("report_global_settlement_transfer", {
          p_transfer_id: transferId, p_request_id: requestId,
        })
      } else {
        const rpcName = action === "confirm" ? "confirm_global_settlement_transfer"
          : action === "reject" ? "reject_global_settlement_transfer" : "cancel_global_settlement_transfer"
        updated = await apiRpc<GlobalSettlementPlan>(rpcName, { p_transfer_id: transferId })
      }
      upsertGlobalPlan(updated)
      await refresh()
      await refreshGlobal()
      toast.success(action === "report" ? "Payment reported" : action === "confirm" ? "Receipt confirmed"
        : action === "reject" ? "Payment rejected" : "Transfer cancelled")
    } catch (error) {
      const code = error instanceof Error ? error.message : "request_failed"
      toast.error(code === "stale_global_settlement_plan" || code === "stale_global_settlement_preview"
        ? "The plan no longer matches current balances. Preview a new one."
        : code === "active_friendship_required"
          ? "A friendship in this plan is no longer active. The debtor can cancel the transfer, or you can reject a pending report. Restore the friendship before starting a new plan."
          : "Could not update this global settlement transfer.")
    } finally { setBusy("") }
  }

  useEffect(() => { setRoute(null); setAmount(""); requestId.current = null }, [paymentMode, selectedObligationId])
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
      await apiRpc(paymentMode === "individual" ? "report_individual_payment" : "report_payment", {
        p_obligation_id: obligation.obligation_id, p_amount: amount, p_request_id: requestId.current,
      })
      await refresh(); toast.success("Payment reported", { description: "The creditor must confirm receipt before this debt changes." })
      setAmount(""); requestId.current = null
    } catch (error) {
      const code = error instanceof Error ? error.message : "request_failed"
      toast.error(code === "payment_exceeds_net_peer_balance" ? "That exceeds the net amount owed to this person. Refresh balances and try again." : "Could not report that amount. Check the unreserved balance and try again.")
    }
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
    <Card>
      <CardHeader>
        <CardTitle>Settle across friends</CardTitle>
        <CardDescription>Preview one outside payment across eligible debts in any group. Friends must have global netting enabled. Debts change only after each recipient confirms receipt.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background/35 p-4">
          <p className="max-w-3xl text-sm text-muted-foreground">
            {globalNettingEnabled
              ? "Global netting is on for you. Friends who have left it on can be included when connected by eligible debts."
              : "Global netting is off for you. Turn it on in Friends & trust to create a plan. Friends must have it on too."}
          </p>
          <Button disabled={!globalNettingEnabled || globalLoading || globalLoadError === "unavailable" || !!busy || hasOpenPreview} onClick={() => void previewGlobal()}>
            {busy === "global-preview" ? <Spinner /> : <Route />} {hasOpenPreview ? "Respond to pending plan" : "Preview payment plan"}
          </Button>
        </div>
        {hasOpenPreview && <p className="text-sm text-muted-foreground">Accept, cancel, or decline the pending plan before previewing another one.</p>}

        {globalLoading && globalPlans.length === 0 && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Loading global plans…</div>}
        {globalLoadError && <Alert variant={globalLoadError === "unavailable" ? "default" : "destructive"}><TriangleAlert /><AlertTitle>{globalLoadError === "unavailable" ? "Global settlement is not available yet" : "Could not load global plans"}</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3">{globalLoadError === "unavailable" ? "This Supabase project is missing the global settlement database update. Your existing balances and payment reports still work. Retry after the update is applied." : "Try again to see your latest plan and transfer status."}<Button size="sm" variant="outline" onClick={() => void refreshGlobal()}>Retry</Button></AlertDescription></Alert>}
        {!globalLoading && !globalLoadError && globalPlans.length === 0 && <p className="text-sm text-muted-foreground">No global friend plans yet. Preview a plan when active friends with netting enabled share eligible debts.</p>}
        <div className="grid gap-3">
          {globalPlans.map((plan) => <section key={plan.plan_id} className="grid min-w-0 gap-4 rounded-2xl border bg-background/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid min-w-0 gap-1">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{globalStatusLabel(plan.status, plan.expires_at)}</Badge><span className="text-xs text-muted-foreground">Created {new Date(plan.created_at).toLocaleString()}</span></div>
                <p className="text-sm text-muted-foreground">Friends involved: {plan.participants.map((participant) => participant.display_name).join(", ")}</p>
              </div>
              {(canAcceptGlobalSettlementPlan(plan, me) || canCancelGlobalSettlementPlan(plan, me) || canDeclineGlobalSettlementPlan(plan, me)) &&
                <div className="flex flex-wrap gap-2">
                  {canAcceptGlobalSettlementPlan(plan, me) && <Button size="sm" disabled={!!busy} onClick={() => void acceptGlobalPlan(plan)}>
                    {busy === plan.plan_id && <Spinner />} Accept and reserve debts
                  </Button>}
                  {(canCancelGlobalSettlementPlan(plan, me) || canDeclineGlobalSettlementPlan(plan, me)) &&
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void dismissGlobalPlan(plan)}>
                      {busy === plan.plan_id && <Spinner />} <X /> {plan.created_by === me ? "Cancel preview" : "Decline plan"}
                    </Button>}
                </div>}
            </div>
            <div className="grid gap-3">
              {plan.transfers.map((transfer) => {
                const actions = globalTransferActions(transfer, me, transfer.source_friendships_active)
                return <div key={transfer.transfer_id} className="grid min-w-0 gap-3 rounded-xl border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-medium">
                      <span>{transfer.debtor_name}</span><ArrowRight className="size-4 text-muted-foreground" /><span>{transfer.creditor_name}</span>
                      <Badge variant="outline">{globalStatusLabel(transfer.status)}</Badge>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{inr(transfer.amount)}</span>
                  </div>
                  <div className="grid gap-1 border-l-2 pl-3 text-xs text-muted-foreground">
                    {transfer.allocations.map((allocation) => <div key={allocation.allocation_id} className="flex min-w-0 flex-wrap justify-between gap-x-4 gap-y-1">
                      <span className="min-w-0">{allocation.kind === "CYCLE_CLEAR" ? "Cycle balance" : "Payment"} · {allocation.group_name} · {allocation.expense_title}</span>
                      <span className="shrink-0 tabular-nums">{inr(allocation.amount)}</span>
                    </div>)}
                  </div>
                  {transfer.source_friendships_active === false && (transfer.status === "ACCEPTED" || transfer.status === "PENDING") &&
                    <p className="text-xs text-destructive">A source friendship is no longer active. Reporting or confirming is paused. Cancel or reject this transfer, or restore the friendship.</p>}
                  {actions.length > 0 && <div className="flex flex-wrap gap-2">
                    {actions.includes("report") && <Button size="sm" disabled={!!busy} onClick={() => void runGlobalAction(plan, transfer.transfer_id, "report")}><Banknote /> I paid outside NoBroke</Button>}
                    {actions.includes("confirm") && <Button size="sm" disabled={!!busy} onClick={() => void runGlobalAction(plan, transfer.transfer_id, "confirm")}><Check /> Confirm receipt</Button>}
                    {actions.includes("reject") && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void runGlobalAction(plan, transfer.transfer_id, "reject")}><X /> Reject</Button>}
                    {actions.includes("cancel") && <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void runGlobalAction(plan, transfer.transfer_id, "cancel")}>Cancel transfer</Button>}
                  </div>}
                  {transfer.status === "PENDING" && <p className="text-xs text-muted-foreground">Reported outside NoBroke. The linked debts remain reserved until {transfer.creditor_name} confirms or rejects receipt.</p>}
                </div>
              })}
            </div>
          </section>)}
        </div>
        {globalHistory.length > 0 && <details className="rounded-xl border px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Global transfer history ({globalHistory.length})</summary>
          <div className="mt-3 grid gap-2">
            {globalHistory.slice(0, 10).map((transfer) => <div key={transfer.transfer_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="min-w-0 text-muted-foreground">{transfer.debtor_name} <ArrowRight className="inline size-3" /> {transfer.creditor_name} · {globalStatusLabel(transfer.status)}</span>
              <span className="shrink-0 tabular-nums">{inr(transfer.amount)}</span>
            </div>)}
          </div>
        </details>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Net settlement positions</CardTitle><CardDescription>Amounts offset what each person owes you against what you owe them.</CardDescription></CardHeader>
      <CardContent>
        {netPositions.length === 0 ? <p className="text-sm text-muted-foreground">No open balances to settle.</p> :
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {netPositions.map((position) => {
              const availableToPay = balanceByPeer.get(position.user_id)?.available_to_pay ?? "0.00"
              const reminderTarget = position.direction === "OWES_YOU"
                ? findRemindableReceivable(obligations, me, position.user_id)
                : null
              return <div key={position.user_id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border bg-card/50 p-3">
                <UserAvatar id={position.user_id} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{userName(position.user_id)}</p>
                  <p className="text-xs text-muted-foreground">{position.direction === "OWES_YOU" ? `${userName(position.user_id)} owes you` : position.direction === "YOU_OWE" ? `You owe ${userName(position.user_id)}` : "You are square"}</p>
                  {position.direction === "YOU_OWE" && <p className="text-xs text-muted-foreground">Available to report: {inr(availableToPay)}</p>}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="font-semibold tabular-nums">{inr(position.amount)}</span>
                  {reminderTarget && <Button size="sm" variant="outline" disabled={reminding === position.user_id} onClick={() => void remind(position.user_id)}>
                    <Bell /> {reminding === position.user_id ? "Sending…" : "Remind"}
                  </Button>}
                </div>
              </div>
            })}
          </div>}
      </CardContent>
    </Card>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Report an outside payment</CardTitle><CardDescription>Choose a quick net payment or report payment against one specific debt. The recipient must confirm receipt before the ledger and everyone’s balances update across groups.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          <div role="group" aria-label="Payment reporting method" className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant={paymentMode === "net" ? "default" : "outline"}
              aria-pressed={paymentMode === "net"} onClick={() => setPaymentMode("net")}>Net settlement</Button>
            <Button type="button" size="sm" variant={paymentMode === "individual" ? "default" : "outline"}
              aria-pressed={paymentMode === "individual"} onClick={() => setPaymentMode("individual")}>Individual debt</Button>
          </div>
          {paymentTargets.length === 0 ? <p className="text-sm text-muted-foreground">{openDebts.length === 0
            ? "You have no open debts to report."
            : paymentMode === "net"
              ? "No net payment is due to these people. Check the net positions above before paying."
              : "No unreserved open debts are available to report."}</p> : <>
            <Field><FieldLabel htmlFor="debt">{paymentMode === "net" ? "Person" : "Debt"}</FieldLabel>
              <SimpleSelect id="debt" value={selectedObligationId} onValueChange={setSelected}
                options={paymentTargets.map((item) => ({ value: item.obligation_id, label: paymentMode === "net"
                  ? `${userName(item.creditor_id)} · up to ${inr(amountAvailableFor(item))} net`
                  : `${userName(item.creditor_id)} · ${item.source || "Open debt"} · up to ${inr(individualAmountAvailableFor(item))}` }))} />
            </Field>
            {paymentMode === "individual" && <p className="text-sm text-muted-foreground">This amount can be higher than the net balance with this person. It reduces only the selected debt after they confirm receipt, then net balances recalculate across all groups.</p>}
            <Field><FieldLabel htmlFor="payment-amount">Amount paid ({paymentMode === "net" ? "available net" : "available on this debt"} {inr(available)})</FieldLabel>
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
