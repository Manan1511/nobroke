// Dashboard building blocks (layout follows TailAdmin's dashboard: stat row, wide chart + target ring,
// breakdown + lists). Everything here only displays numbers the backend would send.
import { useState } from "react"
import { format, parseISO, differenceInCalendarDays } from "date-fns"
import { RefreshCw, Route, Workflow, ArrowLeftRight, TrendingDown, TrendingUp } from "lucide-react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart, ReferenceLine, XAxis, YAxis } from "recharts"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { label } from "@/components/shared"
import { useStore } from "@/lib/store"
import { cn, inr } from "@/lib/utils"
import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import type { SpendingMonth } from "@/types"
import { Count, Glare, Money, Reveal, Spotlight } from "@/components/motion"

const TODAY = new Date()
const thisMonth = format(TODAY, "yyyy-MM")
const compact = (n: number) => (Math.abs(n) >= 1000 ? `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `₹${n}`)

interface TipRow { name: string; value: string; color?: string }
// Recharts injects active/payload into the element passed as `content`.
function Tip({ active, payload, title, rows }: { active?: boolean; payload?: any[]; title?: (d: any) => ReactNode; rows: (p: any[]) => TipRow[] }) {
  if (!active || !payload?.length) return null
  return (
    <div className="grid min-w-36 gap-1.5 rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
      {title && <div className="font-medium">{title(payload[0].payload)}</div>}
      {rows(payload).map((r) => (
        <div key={r.name} className="flex items-center gap-2">
          {r.color && <span className="size-2.5 rounded-[3px]" style={{ background: r.color }} />}
          <span className="text-muted-foreground">{r.name}</span>
          <span className="ml-auto font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ---------- Stat cards ---------- */

type Tone = "negative" | "positive" | "neutral"
const TONES: Record<Tone, { chip: string; value: string; glow: string }> = {
  negative: { chip: "bg-negative-soft text-negative", value: "text-negative", glow: "from-negative-soft/70" },
  positive: { chip: "bg-positive-soft text-positive", value: "text-positive", glow: "from-positive-soft/70" },
  neutral: { chip: "bg-secondary text-secondary-foreground", value: "text-foreground", glow: "from-secondary/70" },
}

export interface Trend { up: boolean; good: boolean; text: string; vs: string }
export function StatCard({ title, value, icon: Icon, tone, note, trend, loading }: { title: string; value: number; icon: LucideIcon; tone: Tone; note?: string; trend?: Trend | null; loading?: boolean }) {
  const t = TONES[tone]
  return (
    <Glare><Card className={cn("h-full gap-3 bg-gradient-to-br to-transparent to-60%", t.glow)}>
      <CardHeader>
        <CardDescription className="font-medium">{title}</CardDescription>
        <CardAction><span className={cn("flex size-9 items-center justify-center rounded-full", t.chip)}><Icon className="size-4" /></span></CardAction>
        {loading ? <Skeleton className="h-8 w-32" /> : <CardTitle className={cn("text-2xl", t.value)}><Money value={value} /></CardTitle>}
      </CardHeader>
      <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
        {trend && (
          <Badge variant="outline" className={cn("border-transparent", trend.good ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative")}>
            {trend.up ? <TrendingUp /> : <TrendingDown />}{trend.text}
          </Badge>
        )}
        <span>{note}</span>
      </CardContent>
    </Card></Glare>
  )
}

/* ---------- Spending over time (area, period tabs) ---------- */

const SPEND_CONFIG = { your_share: { label: "Your share", color: "var(--chart-1)" }, you_paid: { label: "You paid", color: "var(--chart-2)" } }

export function SpendingChart() {
  const { spending } = useStore()
  const [range, setRange] = useState("6")
  const data = spending.slice(-Number(range)).map((m) => ({ ...m, label: format(parseISO(`${m.month}-01`), "MMM") }))
  const share = data.reduce((s, m) => s + m.your_share, 0)
  const paid = data.reduce((s, m) => s + m.you_paid, 0)

  return (
    <Spotlight><Card className="h-full">
      <CardHeader>
        <CardTitle>Spending over time</CardTitle>
        <CardDescription>Your share of group costs vs what you paid up front.</CardDescription>
        <CardAction>
          <Tabs value={range} onValueChange={setRange}>
            <TabsList>
              <TabsTrigger value="3">3M</TabsTrigger>
              <TabsTrigger value="6">6M</TabsTrigger>
              <TabsTrigger value="12">12M</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          {[["your_share", share], ["you_paid", paid]].map(([k, v]) => (
            <div key={k} className="grid gap-0.5">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-[3px]" style={{ background: SPEND_CONFIG[k].color }} />{SPEND_CONFIG[k].label}
              </span>
              <span className="text-lg font-semibold tabular-nums">{inr(v)}</span>
            </div>
          ))}
        </div>
        <ChartContainer config={SPEND_CONFIG} className="aspect-auto h-64 w-full">
          <AreaChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
            <defs>
              {Object.keys(SPEND_CONFIG).map((k) => (
                <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={compact} />
            <ChartTooltip cursor={{ stroke: "var(--border)" }} content={
              <Tip title={(d) => format(parseISO(`${d.month}-01`), "MMMM yyyy")}
                rows={(p) => p.map((i) => ({ name: SPEND_CONFIG[i.dataKey].label, value: inr(i.value), color: SPEND_CONFIG[i.dataKey].color }))} />
            } />
            <Area dataKey="you_paid" type="monotone" stroke="var(--color-you_paid)" strokeWidth={2} fill="url(#fill-you_paid)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
            <Area dataKey="your_share" type="monotone" stroke="var(--color-your_share)" strokeWidth={2} fill="url(#fill-your_share)" activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card></Spotlight>
  )
}

/* ---------- Settled this month (TailAdmin "Monthly target" ring) ---------- */

export function SettledRing() {
  const { batches, obligations, me } = useStore()
  const mine = batches.filter((b) => b.executed_at.startsWith(thisMonth) && b.legs.some((l) => l.from_user === me || l.to_user === me))
  const cleared = mine.reduce((s, b) => s + b.total_cleared, 0)
  const left = obligations.filter((o) => o.debtor_id === me && o.status !== "SETTLED").reduce((s, o) => s + o.remaining_amount, 0)
  const pct = cleared + left > 0 ? Math.round((cleared / (cleared + left)) * 100) : 100
  const data = [{ name: "cleared", value: pct, fill: "var(--chart-1)" }]

  return (
    <Spotlight><Card className="h-full">
      <CardHeader>
        <CardTitle>Settled this month</CardTitle>
        <CardDescription>How much of what you owed in {format(TODAY, "MMMM")} is cleared.</CardDescription>
      </CardHeader>
      <CardContent className="grid place-items-center">
        <ChartContainer config={{ value: { label: "Cleared" } }} className="relative aspect-[2/1] h-auto w-full max-w-72">
          <RadialBarChart data={data} startAngle={180} endAngle={0} innerRadius="120%" outerRadius="165%" cy="100%">
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
            <RadialBar dataKey="value" background={{ fill: "var(--muted)" }} cornerRadius={12} />
          </RadialBarChart>
        </ChartContainer>
        <div className="-mt-14 grid place-items-center gap-1 text-center">
          <span className="text-3xl font-semibold"><Count value={pct} suffix="%" /></span>
          <Badge variant="outline" className="border-transparent bg-positive-soft text-positive">{inr(cleared)} cleared</Badge>
        </div>
        <p className="mt-4 max-w-64 text-center text-sm text-muted-foreground">
          {left > 0 ? `${inr(left)} still to pay. Settle through friends to clear it without new cash.` : "You're all square this month."}
        </p>
      </CardContent>
      <CardFooter className="grid grid-cols-3 divide-x border-t pt-4 text-center">
        {[["Cleared", inr(cleared)], ["Still to pay", inr(left)], ["Settlements", mine.length]].map(([k, v]) => (
          <div key={k} className="grid gap-0.5 px-2">
            <span className="text-xs text-muted-foreground">{k}</span>
            <span className="text-sm font-semibold tabular-nums">{v}</span>
          </div>
        ))}
      </CardFooter>
    </Card></Spotlight>
  )
}

/* ---------- Who owes whom (diverging bars) ---------- */

export function BalanceChart() {
  const { obligations, me, userName } = useStore()
  const byPerson: Record<string, number> = {}
  for (const o of obligations.filter((x) => x.status !== "SETTLED")) {
    if (o.creditor_id === me) byPerson[o.debtor_id] = (byPerson[o.debtor_id] ?? 0) + o.remaining_amount
    if (o.debtor_id === me) byPerson[o.creditor_id] = (byPerson[o.creditor_id] ?? 0) - o.remaining_amount
  }
  const data = Object.entries(byPerson).map(([id, value]) => ({ name: userName(id).split(" ")[0], full: userName(id), value })).sort((a, b) => b.value - a.value)
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1)

  const ValueLabel = ({ x = 0, y = 0, width = 0, height = 0, value = 0 }: { x?: number; y?: number; width?: number; height?: number; value?: number }) => {
    const end = value < 0 ? Math.min(x, x + width) - 8 : Math.max(x, x + width) + 8
    return (
      <text x={end} y={y + height / 2} dy="0.35em" textAnchor={value < 0 ? "end" : "start"} className="fill-foreground text-xs font-medium tabular-nums">
        {value < 0 ? "−" : "+"}{inr(Math.abs(value))}
      </text>
    )
  }

  return (
    <Spotlight><Card className="h-full">
      <CardHeader>
        <CardTitle>Who owes whom</CardTitle>
        <CardDescription>Your open balance with each person, across all groups.</CardDescription>
        <CardAction className="hidden gap-3 text-xs text-muted-foreground sm:flex">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-(--chart-positive)" /> Owes you</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-(--chart-negative)" /> You owe</span>
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <Empty className="border-0"><EmptyHeader><EmptyTitle>You're all square</EmptyTitle><EmptyDescription>No open balances with anyone.</EmptyDescription></EmptyHeader></Empty>
        ) : (
          <ChartContainer config={{ value: { label: "Balance" } }} className="aspect-auto w-full" style={{ height: data.length * 44 + 16 }}>
            <BarChart data={data} layout="vertical" margin={{ left: 4, right: 4, top: 4, bottom: 4 }} barCategoryGap={10}>
              <XAxis type="number" hide domain={[-max * 1.45, max * 1.45]} />
              <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={64} tick={{ fontSize: 12 }} />
              <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
              <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={
                <Tip title={(d) => d.full} rows={(p) => [{ name: p[0].value < 0 ? "You owe" : "Owes you", value: inr(Math.abs(p[0].value)) }]} />
              } />
              <Bar dataKey="value" radius={4} maxBarSize={22}>
                {data.map((d) => <Cell key={d.full} fill={d.value < 0 ? "var(--chart-negative)" : "var(--chart-positive)"} />)}
                <LabelList dataKey="value" content={<ValueLabel />} />
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card></Spotlight>
  )
}

/* ---------- Where the money went (donut by group, this month) ---------- */

const GROUP_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]

export function GroupDonut() {
  const { expenses, groups } = useStore()
  // Colour follows the group (its position in your groups list), never its rank.
  const colorOf: Record<string, string> = Object.fromEntries(groups.map((g, i) => [g.group_id, GROUP_COLORS[i % GROUP_COLORS.length]]))
  const month = expenses.filter((e) => e.created_at.startsWith(thisMonth))
  const data = groups.map((g) => ({ id: g.group_id, name: g.group_name, value: month.filter((e) => e.group_id === g.group_id).reduce((s, e) => s + e.total_amount, 0) }))
    .filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <Spotlight><Card className="h-full">
      <CardHeader>
        <CardTitle>Where the money went</CardTitle>
        <CardDescription>Spending in your groups this month.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-[minmax(0,180px)_1fr] sm:items-center">
        {total === 0 ? <p className="text-sm text-muted-foreground">Nothing spent yet this month.</p> : <>
          <div className="relative mx-auto aspect-square w-full max-w-44">
            <ChartContainer config={{ value: { label: "Spent" } }} className="aspect-square w-full">
              <PieChart>
                <ChartTooltip content={<Tip rows={(p) => [{ name: p[0].payload.name, value: inr(p[0].value), color: colorOf[p[0].payload.id] }]} />} />
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="var(--card)" strokeWidth={2} cornerRadius={4}>
                  {data.map((d) => <Cell key={d.id} fill={colorOf[d.id]} />)}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-sm font-semibold tabular-nums">{inr(total)}</span>
            </div>
          </div>
          <ul className="grid gap-3">
            {data.map((d) => (
              <li key={d.id} className="grid gap-1.5">
                <div className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-[3px]" style={{ background: colorOf[d.id] }} />
                  <span>{d.name}</span>
                  <span className="ml-auto font-medium tabular-nums">{inr(d.value)}</span>
                  <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">{Math.round((d.value / total) * 100)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${(d.value / total) * 100}%`, background: colorOf[d.id] }} />
                </div>
              </li>
            ))}
          </ul>
        </>}
      </CardContent>
    </Card></Spotlight>
  )
}

/* ---------- Upcoming bills ---------- */

export function UpcomingBills({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { recurring, groupName } = useStore()
  const list = recurring.filter((t) => t.is_active && t.next_run_date).sort((a, b) => a.next_run_date.localeCompare(b.next_run_date)).slice(0, 4)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming bills</CardTitle>
        <CardDescription>Recurring bills that will be split soon.</CardDescription>
        <CardAction><Button variant="ghost" size="sm" onClick={() => onNavigate("recurring")}>See all</Button></CardAction>
      </CardHeader>
      <CardContent>
        <Reveal className="grid gap-3" stagger={0.08} delay={0.2}>
        {list.length === 0 && <p className="text-sm text-muted-foreground">No active recurring bills.</p>}
        {list.map((t) => {
          const date = parseISO(t.next_run_date)
          const days = differenceInCalendarDays(date, TODAY)
          return (
            <div key={t.template_id} className="flex items-center gap-3">
              <div className="grid w-12 shrink-0 place-items-center rounded-lg border bg-muted/40 py-1.5 leading-none">
                <span className="text-[10px] font-medium uppercase text-muted-foreground">{format(date, "MMM")}</span>
                <span className="text-lg font-semibold">{format(date, "d")}</span>
              </div>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm font-medium">{t.title}</span>
                <span className="truncate text-xs text-muted-foreground">{groupName(t.group_id)} · {label(t.split_mode)}</span>
              </div>
              <div className="grid justify-items-end gap-0.5">
                <span className="text-sm font-medium tabular-nums">{inr(t.total_amount)}</span>
                <span className={cn("text-xs", days <= 7 ? "text-warning" : "text-muted-foreground")}>{days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}</span>
              </div>
            </div>
          )
        })}
        </Reveal>
      </CardContent>
    </Card>
  )
}

/* ---------- Recent activity (settlement history as a timeline) ---------- */

const ACTIVITY: Record<string, { icon: LucideIcon; tone: string }> = {
  DIRECT: { icon: ArrowLeftRight, tone: "bg-secondary text-secondary-foreground" },
  MULTI_HOP: { icon: Route, tone: "bg-info-soft text-info" },
  CASCADE_DOMINO: { icon: Workflow, tone: "bg-positive-soft text-positive" },
  CYCLE_CLEAR: { icon: RefreshCw, tone: "bg-warning-soft text-warning" },
}

export function RecentActivity({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { batches, userName } = useStore()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>Settlements that went through.</CardDescription>
        <CardAction><Button variant="ghost" size="sm" onClick={() => onNavigate("settle")}>See all</Button></CardAction>
      </CardHeader>
      <CardContent>
        <ol className="relative grid gap-5 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-border">
          {batches.slice(0, 4).map((b) => {
            const a = ACTIVITY[b.settlement_type] ?? ACTIVITY.DIRECT
            return (
              <li key={b.batch_id} className="relative flex gap-3">
                <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card", a.tone)}><a.icon className="size-4" /></span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{label(b.settlement_type)}</span>
                    <span className="ml-auto text-sm font-medium tabular-nums">{inr(b.total_cleared)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{b.legs.map((l) => `${userName(l.from_user)} → ${userName(l.to_user)}`).join(", ")}</span>
                  <span className="text-xs text-muted-foreground">{format(parseISO(b.executed_at), "d MMM")}</span>
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

/* ---------- Helpers for the stat row ---------- */

export function monthTrend(spending: SpendingMonth[]): Trend | null {
  const [prev, cur] = spending.slice(-2)
  if (!prev || !cur) return null
  const change = ((cur.your_share - prev.your_share) / prev.your_share) * 100
  return { up: change >= 0, good: change <= 0, text: `${Math.abs(change).toFixed(1)}%`, vs: format(parseISO(`${prev.month}-01`), "MMM") }
}
