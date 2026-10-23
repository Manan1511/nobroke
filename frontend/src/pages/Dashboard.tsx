import { Info, Plus, ArrowLeftRight, ArrowUpRight, ArrowDownLeft, Scale, Wallet } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { PageHeader, StatusBadge, UserAvatar, label } from "@/components/shared"
import { PersonHover } from "@/components/form-bits"
import { BalanceChart, ConfirmedPayments, GroupDonut, RecentActivity, SpendingChart, StatCard, UpcomingBills } from "@/components/dashboard"
import { useStore } from "@/lib/store"
import { cn, inr } from "@/lib/utils"
import { filterOpenObligations } from "@/lib/dashboard-data.mjs"
import { useSession } from "@/lib/session"

// Soft colour per split type, so the recent expenses list is easy to scan.
const SPLIT_DOT = { EQUAL: "bg-primary", EXACT: "bg-info", INCOME_RATIO: "bg-warning" }

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening" }

export default function Dashboard({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { obligations, expenses, rules, me, groupName, dashboard, loading, loadError, refresh } = useStore()
  const owe = Number(dashboard.owe_total)
  const owed = Number(dashboard.owed_total)
  const net = Number(dashboard.net_balance)
  const armed = rules.filter((r) => r.status === "ARMED").length
  const session = useSession()
  const thisMonth = Number(dashboard.current_month_spend)
  const hasGroups = dashboard.group_count > 0
  const showFirstGroupPrompt = !loading && !loadError && !hasGroups
  const openObligations = filterOpenObligations(obligations).filter((o) => o.debtor_id === me || o.creditor_id === me)

  return (
    <>
      <PageHeader title="Dashboard" description="Where your money stands across every group."
        action={hasGroups && <div className="flex gap-2">
          <Button variant="outline" onClick={() => onNavigate("settle")}><ArrowLeftRight /> Settle up</Button>
          <Button onClick={() => onNavigate("expenses")}><Plus /> Add expense</Button>
        </div>} />

      {loadError && <Alert variant="destructive"><Info /><AlertTitle>Could not refresh your dashboard</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">We could not load your latest account data. Check your connection and retry.
          <Button variant="outline" size="sm" onClick={() => void refresh()}>Retry</Button>
        </AlertDescription></Alert>}

      <p className="-mt-3 text-lg font-medium text-foreground">{greeting()}, {(session?.name ?? "there").split(" ")[0]}.</p>

      {hasGroups && armed > 0 && (
        <Alert className="border-info/25 bg-info-soft [&>svg]:text-info">
          <Info />
          <AlertTitle>{armed} pay-when-paid rule{armed > 1 ? "s are" : " is"} waiting</AlertTitle>
          <AlertDescription>
            A confirmed receipt can create a forwarding task. Any outside payment still needs creditor confirmation.
            <Button variant="link" className="h-auto p-0 text-info" onClick={() => onNavigate("rules")}>View rules</Button>
          </AlertDescription>
        </Alert>
      )}

      {showFirstGroupPrompt ? (
        <Empty className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Plus /></EmptyMedia>
            <EmptyTitle>Start with a group</EmptyTitle>
            <EmptyDescription>Create a group for a flat, trip, or shared plan. Add expenses to see balances and spending here.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button onClick={() => onNavigate("groups")}>Create your first group</Button></EmptyContent>
        </Empty>
      ) : hasGroups || loading ? <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="You owe" value={owe} icon={ArrowUpRight} tone="negative" loading={loading}
          note={`Across ${dashboard.open_payable_count} open debt${dashboard.open_payable_count === 1 ? "" : "s"}`} />
        <StatCard title="You're owed" value={owed} icon={ArrowDownLeft} tone="positive" loading={loading}
          note={`Across ${dashboard.open_receivable_count} open balance${dashboard.open_receivable_count === 1 ? "" : "s"}`} />
        <StatCard title="Net balance" value={net} icon={Scale} tone={net < 0 ? "negative" : net > 0 ? "positive" : "neutral"} loading={loading}
          note={net < 0 ? "You owe more than you're owed" : net > 0 ? "You're owed more than you owe" : "You're all square"} />
        <StatCard title="Your spending this month" value={thisMonth} icon={Wallet} tone="neutral" loading={loading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8 [&>*]:h-full"><SpendingChart /></div>
        <div className="xl:col-span-4 [&>*]:h-full"><ConfirmedPayments /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 [&>*]:h-full"><BalanceChart /></div>
        <div className="lg:col-span-5 [&>*]:h-full"><GroupDonut /></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Open balances</CardTitle>
            <CardAction><Button variant="ghost" size="sm" onClick={() => onNavigate("balances")}>See all</Button></CardAction>
          </CardHeader>
          <CardContent>
            {loading ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div> : (
              openObligations.length === 0 ? <Empty className="border-0 py-6">
                <EmptyHeader><EmptyTitle>You're all square</EmptyTitle><EmptyDescription>New group expenses will appear here until they're cleared.</EmptyDescription></EmptyHeader>
              </Empty> :
              <Table>
                <TableBody>
                  {openObligations.slice(0, 5).map((o) => {
                    const iOwe = o.debtor_id === me
                    const other = iOwe ? o.creditor_id : o.debtor_id
                    return (
                      <TableRow key={o.obligation_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <UserAvatar id={other} className="size-7" />
                            {iOwe ? <>You owe <PersonHover id={other} /></> : <><PersonHover id={other} /> owes you</>}
                          </div>
                        </TableCell>
                        <TableCell><StatusBadge status={o.status} /></TableCell>
                        <TableCell className={cn("text-right font-medium tabular-nums", iOwe ? "text-negative" : "text-positive")}>
                          {iOwe ? "−" : "+"}{inr(o.remaining_amount)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <UpcomingBills onNavigate={onNavigate} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent expenses</CardTitle>
            <CardAction><Button variant="ghost" size="sm" onClick={() => onNavigate("expenses")}>See all</Button></CardAction>
          </CardHeader>
          <CardContent>
            {loading ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div> : (
              expenses.length === 0 ? <Empty className="border-0 py-6">
                <EmptyHeader><EmptyTitle>No expenses yet</EmptyTitle><EmptyDescription>Add a shared expense to see it here.</EmptyDescription></EmptyHeader>
                <EmptyContent><Button variant="outline" size="sm" onClick={() => onNavigate("expenses")}>Add an expense</Button></EmptyContent>
              </Empty> :
              <Table>
                <TableHeader><TableRow><TableHead>Expense</TableHead><TableHead>Group</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {[...expenses].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5).map((e) => (
                    <TableRow key={e.expense_id}>
                      <TableCell>
                        {e.title}
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={cn("size-1.5 rounded-full", SPLIT_DOT[e.split_mode])} />{label(e.split_mode)}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{groupName(e.group_id)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(e.total_amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <RecentActivity onNavigate={onNavigate} />
      </div>
      </> : null}
    </>
  )
}
