import { useEffect, useState } from "react"
import { Info, Plus, ArrowLeftRight, ArrowUpRight, ArrowDownLeft, Scale } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { PageHeader, StatusBadge, UserAvatar, label } from "@/components/shared"
import { useStore } from "@/lib/store"
import { cn, inr } from "@/lib/utils"

// Soft colour per split type, so the recent expenses list is easy to scan.
const SPLIT_DOT = { EQUAL: "bg-primary", EXACT: "bg-info", INCOME_RATIO: "bg-warning" }

const TONES = {
  negative: { chip: "bg-negative-soft text-negative", value: "text-negative", glow: "from-negative-soft/70" },
  positive: { chip: "bg-positive-soft text-positive", value: "text-positive", glow: "from-positive-soft/70" },
  neutral: { chip: "bg-secondary text-secondary-foreground", value: "text-foreground", glow: "from-secondary/70" },
}

function StatCard({ title, value, icon: Icon, tone, note, loading }) {
  const t = TONES[tone]
  return (
    <Card className={cn("gap-3 bg-gradient-to-br to-card to-60% shadow-none", t.glow)}>
      <CardHeader>
        <CardDescription className="font-medium">{title}</CardDescription>
        <CardAction><span className={cn("flex size-9 items-center justify-center rounded-full", t.chip)}><Icon className="size-4" /></span></CardAction>
        {loading ? <Skeleton className="h-8 w-32" /> : <CardTitle className={cn("text-2xl tabular-nums", t.value)}>{inr(value)}</CardTitle>}
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{note}</CardContent>
    </Card>
  )
}

export default function Dashboard({ onNavigate }) {
  const { obligations, expenses, rules, me, userName, groupName } = useStore()
  const [loading, setLoading] = useState(true)
  useEffect(() => { const t = setTimeout(() => setLoading(false), 600); return () => clearTimeout(t) }, [])

  // Display totals only — the real numbers come from the backend.
  const oweList = obligations.filter((o) => o.debtor_id === me && o.status !== "SETTLED")
  const owedList = obligations.filter((o) => o.creditor_id === me && o.status !== "SETTLED")
  const owe = oweList.reduce((s, o) => s + o.remaining_amount, 0)
  const owed = owedList.reduce((s, o) => s + o.remaining_amount, 0)
  const net = owed - owe
  const armed = rules.filter((r) => r.status === "ARMED").length

  return (
    <>
      <PageHeader title="Dashboard" description="Where your money stands across every group."
        action={<div className="flex gap-2">
          <Button variant="outline" onClick={() => onNavigate("settle")}><ArrowLeftRight /> Settle up</Button>
          <Button onClick={() => onNavigate("expenses")}><Plus /> Add expense</Button>
        </div>} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="You owe" value={owe} icon={ArrowUpRight} tone="negative" loading={loading}
          note={`Across ${oweList.length} open debt${oweList.length === 1 ? "" : "s"}`} />
        <StatCard title="You're owed" value={owed} icon={ArrowDownLeft} tone="positive" loading={loading}
          note={`From ${owedList.length} friend${owedList.length === 1 ? "" : "s"}`} />
        <StatCard title="Net balance" value={net} icon={Scale} tone={net < 0 ? "negative" : net > 0 ? "positive" : "neutral"} loading={loading}
          note={net < 0 ? "You owe more than you're owed" : net > 0 ? "You're owed more than you owe" : "You're all square"} />
      </div>

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
                  {obligations.filter((o) => o.status !== "SETTLED").slice(0, 4).map((o) => {
                    const iOwe = o.debtor_id === me
                    const other = iOwe ? o.creditor_id : o.debtor_id
                    return (
                      <TableRow key={o.obligation_id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <UserAvatar id={other} className="size-7" />
                            {iOwe ? `You owe ${userName(other)}` : `${userName(other)} owes you`}
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
                  {expenses.slice(0, 4).map((e) => (
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
      </div>
    </>
  )
}
