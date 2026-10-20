import { useEffect, useState } from "react"
import { Info, Plus, ArrowLeftRight, ArrowUpRight, ArrowDownLeft, Scale, Wallet } from "lucide-react"
import { Card, CardHeader, CardTitle, CardContent, CardAction } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { PageHeader, StatusBadge, UserAvatar, label } from "@/components/shared"
import { PersonHover } from "@/components/form-bits"
import { BalanceChart, GroupDonut, RecentActivity, SettledRing, SpendingChart, StatCard, UpcomingBills, monthTrend } from "@/components/dashboard"
import { useStore } from "@/lib/store"
import { cn, inr } from "@/lib/utils"

// Soft colour per split type, so the recent expenses list is easy to scan.
const SPLIT_DOT = { EQUAL: "bg-primary", EXACT: "bg-info", INCOME_RATIO: "bg-warning" }

export default function Dashboard({ onNavigate }) {
  const { obligations, expenses, rules, spending, me, groupName } = useStore()
  const [loading, setLoading] = useState(true)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t) }, [])

  // Display totals only — the real numbers come from the backend.
  const oweList = obligations.filter((o) => o.debtor_id === me && o.status !== "SETTLED")
  const owedList = obligations.filter((o) => o.creditor_id === me && o.status !== "SETTLED")
  const owe = oweList.reduce((s, o) => s + o.remaining_amount, 0)
  const owed = owedList.reduce((s, o) => s + o.remaining_amount, 0)
  const net = owed - owe
  const armed = rules.filter((r) => r.status === "ARMED").length
  const trend = monthTrend(spending)
  const thisMonth = spending.at(-1)?.your_share ?? 0

  return (
    <>
      <PageHeader title="Dashboard" description="Where your money stands across every group."
        action={<div className="flex gap-2">
          <Button variant="outline" onClick={() => onNavigate("settle")}><ArrowLeftRight /> Settle up</Button>
          <Button onClick={() => onNavigate("expenses")}><Plus /> Add expense</Button>
        </div>} />

      {armed > 0 && (
        <Alert className="border-info/25 bg-info-soft [&>svg]:text-info">
          <Info />
          <AlertTitle>{armed} pay-when-paid rule{armed > 1 ? "s are" : " is"} waiting</AlertTitle>
          <AlertDescription>
            When the money you're waiting on arrives, it'll be passed on automatically.
            <Button variant="link" className="h-auto p-0 text-info" onClick={() => onNavigate("rules")}>View rules</Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="You owe" value={owe} icon={ArrowUpRight} tone="negative" loading={loading}
          note={`Across ${oweList.length} open debt${oweList.length === 1 ? "" : "s"}`} />
        <StatCard title="You're owed" value={owed} icon={ArrowDownLeft} tone="positive" loading={loading}
          note={`From ${owedList.length} friend${owedList.length === 1 ? "" : "s"}`} />
        <StatCard title="Net balance" value={net} icon={Scale} tone={net < 0 ? "negative" : net > 0 ? "positive" : "neutral"} loading={loading}
          note={net < 0 ? "You owe more than you're owed" : net > 0 ? "You're owed more than you owe" : "You're all square"} />
        <StatCard title="Your spending this month" value={thisMonth} icon={Wallet} tone="neutral" loading={loading}
          trend={trend} note={trend ? `vs ${trend.vs}` : ""} />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8 [&>*]:h-full">{loading ? <Skeleton className="h-96 rounded-xl" /> : <SpendingChart />}</div>
        <div className="xl:col-span-4 [&>*]:h-full">{loading ? <Skeleton className="h-96 rounded-xl" /> : <SettledRing />}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 [&>*]:h-full">{loading ? <Skeleton className="h-72 rounded-xl" /> : <BalanceChart />}</div>
        <div className="lg:col-span-5 [&>*]:h-full">{loading ? <Skeleton className="h-72 rounded-xl" /> : <GroupDonut />}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Open balances</CardTitle>
            <CardAction><Button variant="ghost" size="sm" onClick={() => onNavigate("balances")}>See all</Button></CardAction>
          </CardHeader>
          <CardContent>
            {loading ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div> : (
              <Table>
                <TableBody>
                  {obligations.filter((o) => o.status !== "SETTLED").slice(0, 5).map((o) => {
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
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Recent expenses</CardTitle>
            <CardAction><Button variant="ghost" size="sm" onClick={() => onNavigate("expenses")}>See all</Button></CardAction>
          </CardHeader>
          <CardContent>
            {loading ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div> : (
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
    </>
  )
}
