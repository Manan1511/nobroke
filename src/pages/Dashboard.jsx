import { useEffect, useState } from "react"
import { Info, Plus, ArrowLeftRight, ArrowUpRight, ArrowDownLeft, Scale } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from "@/components/ui/card"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Bar, BarChart, Cell, LabelList, ReferenceLine, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { PageHeader, StatusBadge, UserAvatar, label } from "@/components/shared"
import { PersonHover } from "@/components/form-bits"
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

// Your balance with each person: bars to the right = they owe you, to the left = you owe them.
function BalanceChart({ obligations, me, userName }) {
  const byPerson = {}
  for (const o of obligations.filter((x) => x.status !== "SETTLED")) {
    if (o.creditor_id === me) byPerson[o.debtor_id] = (byPerson[o.debtor_id] ?? 0) + o.remaining_amount
    if (o.debtor_id === me) byPerson[o.creditor_id] = (byPerson[o.creditor_id] ?? 0) - o.remaining_amount
  }
  const data = Object.entries(byPerson).map(([id, value]) => ({ name: userName(id).split(" ")[0], full: userName(id), value })).sort((a, b) => b.value - a.value)
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1)
  const config = { value: { label: "Balance" } }

  const ValueLabel = ({ x, y, width, height, value }) => {
    const end = value < 0 ? Math.min(x, x + width) - 8 : Math.max(x, x + width) + 8
    return (
      <text x={end} y={y + height / 2} dy="0.35em" textAnchor={value < 0 ? "end" : "start"} className="fill-foreground text-xs font-medium tabular-nums">
        {value < 0 ? "−" : "+"}{inr(Math.abs(value))}
      </text>
    )
  }
  const Tip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0].payload
    return (
      <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
        <div className="font-medium">{d.full}</div>
        <div className="text-muted-foreground">{d.value < 0 ? `You owe ${inr(-d.value)}` : `Owes you ${inr(d.value)}`}</div>
      </div>
    )
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Who owes whom</CardTitle>
        <CardDescription>Your open balance with each person, across all groups.</CardDescription>
        <CardAction className="hidden gap-3 text-xs text-muted-foreground sm:flex">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-(--chart-positive)" /> Owes you</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-(--chart-negative)" /> You owe</span>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: data.length * 44 + 16 }}>
          <BarChart data={data} layout="vertical" margin={{ left: 4, right: 4, top: 4, bottom: 4 }} barCategoryGap={10}>
            <XAxis type="number" hide domain={[-max * 1.45, max * 1.45]} />
            <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={64} tick={{ fontSize: 12 }} />
            <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
            <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<Tip />} />
            <Bar dataKey="value" radius={4} maxBarSize={22}>
              {data.map((d) => <Cell key={d.full} fill={d.value < 0 ? "var(--chart-negative)" : "var(--chart-positive)"} />)}
              <LabelList dataKey="value" content={<ValueLabel />} />
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
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

      {loading ? <Skeleton className="h-64 rounded-xl" /> : <BalanceChart obligations={obligations} me={me} userName={userName} />}

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
