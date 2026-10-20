import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { NAV } from "@/lib/nav"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

export function PageHeader({ title, description, action }) {
  const section = NAV.find((n) => n.label === title)
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          {section && <section.icon aria-hidden="true" className={cn("section-icon size-6 text-muted-foreground", section.anim)} />}
          {title}
        </h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function UserAvatar({ id, className }) {
  const { userName } = useStore()
  const n = userName(id)
  const initials = n.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
  return <Avatar className={className}><AvatarFallback>{initials}</AvatarFallback></Avatar>
}

export function AvatarStack({ ids }) {
  return (
    <div className="flex -space-x-2">
      {ids.slice(0, 5).map((id) => <UserAvatar key={id} id={id} className="border-2 border-background" />)}
      {ids.length > 5 && <span className="flex size-8 items-center justify-center rounded-full border-2 border-background bg-muted text-xs">+{ids.length - 5}</span>}
    </div>
  )
}

// Soft tinted badges: amber = still open, indigo = in progress, green = done, rose = blocked.
const STATUS = {
  OPEN: "bg-warning-soft text-warning", PARTIAL: "bg-info-soft text-info", SETTLED: "bg-positive-soft text-positive",
  ARMED: "bg-info-soft text-info", TRIGGERED: "bg-positive-soft text-positive", CANCELLED: "bg-muted text-muted-foreground",
  ACTIVE: "bg-positive-soft text-positive", PENDING: "bg-warning-soft text-warning", BLOCKED: "bg-negative-soft text-negative",
}
const LABEL = {
  OPEN: "Open", PARTIAL: "Partly paid", SETTLED: "Settled", ARMED: "Waiting", TRIGGERED: "Paid out", CANCELLED: "Cancelled",
  ACTIVE: "Friends", PENDING: "Request pending", BLOCKED: "Blocked",
  EQUAL: "Equal", EXACT: "Exact amounts", INCOME_RATIO: "By income",
  DIRECT: "Direct", MULTI_HOP: "Through friends", CASCADE_DOMINO: "Auto-forwarded", CYCLE_CLEAR: "Loop cleared",
  WEEKLY: "Weekly", MONTHLY: "Monthly", YEARLY: "Yearly",
}
export const label = (k) => LABEL[k] ?? k
export function StatusBadge({ status }) {
  return <Badge variant="outline" className={cn("border-transparent", STATUS[status])}>{label(status)}</Badge>
}
