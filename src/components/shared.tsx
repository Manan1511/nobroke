import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { NAV } from "@/lib/nav"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"
import BlurText from "@/components/bits/BlurText"

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  const section = NAV.find((n) => n.label === title)
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="flex items-center gap-3 font-display text-4xl leading-none tracking-tight">
          {section && (
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", section.tint)}>
              <section.icon aria-hidden="true" className={cn("section-icon size-5", section.color, section.anim)} />
            </span>
          )}
          <BlurText key={title} text={title} animateBy="letters" delay={35} stepDuration={0.3} trigger="load" />
        </h1>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function UserAvatar({ id, name, className }: { id: string; name?: string; className?: string }) {
  const { userName } = useStore()
  const n = name ?? userName(id)
  const initials = n.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
  return <Avatar className={className}><AvatarFallback>{initials}</AvatarFallback></Avatar>
}

export function AvatarStack({ ids }: { ids: string[] }) {
  return (
    <div className="flex -space-x-2">
      {ids.slice(0, 5).map((id) => <UserAvatar key={id} id={id} className="border-2 border-background" />)}
      {ids.length > 5 && <span className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs">+{ids.length - 5}</span>}
    </div>
  )
}

// Soft tinted badges: amber = still open, indigo = in progress, green = done, rose = blocked.
const STATUS: Record<string, string> = {
  OPEN: "bg-warning-soft text-warning", PARTIAL: "bg-info-soft text-info", SETTLED: "bg-positive-soft text-positive",
  ARMED: "bg-info-soft text-info", TRIGGERED: "bg-positive-soft text-positive", CANCELLED: "bg-muted text-muted-foreground",
  ACTIVE: "bg-positive-soft text-positive", PENDING: "bg-warning-soft text-warning", BLOCKED: "bg-negative-soft text-negative",
}
const LABEL: Record<string, string> = {
  OPEN: "Open", PARTIAL: "Partly paid", SETTLED: "Settled", ARMED: "Waiting", TRIGGERED: "Paid out", CANCELLED: "Cancelled",
  ACTIVE: "Friends", PENDING: "Request pending", BLOCKED: "Blocked",
  EQUAL: "Equal", EXACT: "Exact amounts", INCOME_RATIO: "By income",
  DIRECT: "Direct", MULTI_HOP: "Through friends", CASCADE_DOMINO: "Auto-forwarded", CYCLE_CLEAR: "Loop cleared",
  WEEKLY: "Weekly", MONTHLY: "Monthly", YEARLY: "Yearly",
}
export const label = (k: string) => LABEL[k] ?? k
export function StatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={cn("border-transparent", STATUS[status])}>{label(status)}</Badge>
}
