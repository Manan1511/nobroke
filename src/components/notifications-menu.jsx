// Header bell: unread count, recent notifications, mark all as read.
import { formatDistanceToNow, parseISO } from "date-fns"
import { Bell, BellRing, CalendarClock, CircleCheck, UserPlus, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

const KIND = {
  REMINDER: { icon: BellRing, tone: "bg-warning-soft text-warning", page: "balances" },
  FRIEND_REQUEST: { icon: UserPlus, tone: "bg-info-soft text-info", page: "friends" },
  RULE_ARMED: { icon: Workflow, tone: "bg-info-soft text-info", page: "rules" },
  SETTLED: { icon: CircleCheck, tone: "bg-positive-soft text-positive", page: "settle" },
  BILL: { icon: CalendarClock, tone: "bg-secondary text-secondary-foreground", page: "recurring" },
}

export function NotificationsMenu({ onNavigate }) {
  const { notifications, update } = useStore()
  const unread = notifications.filter((n) => !n.read).length
  const markAll = () => update("notifications", (ns) => ns.map((n) => ({ ...n, read: true })))
  const open = (n) => { update("notifications", (ns) => ns.map((x) => (x.id === n.id ? { ...x, read: true } : x))); onNavigate(KIND[n.type]?.page ?? "dashboard") }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}>
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-negative text-[10px] font-semibold text-primary-foreground">{unread}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={!unread} onClick={markAll}>Mark all as read</Button>
        </div>
        <ScrollArea className="max-h-80">
          <ul className="grid">
            {notifications.map((n) => {
              const k = KIND[n.type] ?? KIND.BILL
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => open(n)} className={cn("flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent", !n.read && "bg-accent/40")}>
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", k.tone)}><k.icon className="size-4" /></span>
                    <span className="grid flex-1 gap-0.5">
                      <span className={cn("text-sm", !n.read && "font-medium")}>{n.text}</span>
                      <span className="text-xs text-muted-foreground">{formatDistanceToNow(parseISO(n.at), { addSuffix: true })}</span>
                    </span>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
