// Header bell: unread count, recent notifications, mark all as read.
import { formatDistanceToNow, parseISO } from "date-fns"
import { useEffect, useState } from "react"
import { Bell, BellRing, CalendarClock, CircleCheck, UserPlus, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import AnimatedList from "@/components/bits/AnimatedList"
import { useStore } from "@/lib/store"
import { apiRpc } from "@/lib/supabase"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"
import type { AppNotification } from "@/types"
import "./notifications-menu.css"

const MOBILE_VIEWPORT_QUERY = "(max-width: 640px)"

function useMobileViewport() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches,
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY)
    const syncViewport = () => setIsMobile(mediaQuery.matches)
    syncViewport()
    mediaQuery.addEventListener("change", syncViewport)
    return () => mediaQuery.removeEventListener("change", syncViewport)
  }, [])

  return isMobile
}

const KIND: Record<string, { icon: LucideIcon; tone: string; page: string }> = {
  REMINDER: { icon: BellRing, tone: "bg-warning-soft text-warning", page: "balances" },
  FRIEND_REQUEST: { icon: UserPlus, tone: "bg-info-soft text-info", page: "friends" },
  RULE_ARMED: { icon: Workflow, tone: "bg-info-soft text-info", page: "rules" },
  SETTLED: { icon: CircleCheck, tone: "bg-positive-soft text-positive", page: "settle" },
  BILL: { icon: CalendarClock, tone: "bg-secondary text-secondary-foreground", page: "recurring" },
}

export function NotificationsMenu({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { notifications, refresh } = useStore()
  const isMobile = useMobileViewport()
  const unread = notifications.filter((n) => !n.read).length
  const markAll = async () => {
    try { await apiRpc("mark_all_notifications_read"); await refresh() }
    catch { toast.error("Could not mark notifications as read.") }
  }
  const open = async (n: AppNotification) => {
    if (!n.read) {
      try { await apiRpc("mark_notification_read", { p_notification_id: n.id }); await refresh() }
      catch { toast.error("Could not update this notification.") }
    }
    onNavigate(KIND[n.type]?.page ?? "dashboard")
  }

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
      {isMobile && <PopoverAnchor aria-hidden="true" className="notifications-mobile-anchor" />}
      <PopoverContent align={isMobile ? "center" : "end"} collisionPadding={12} className="notifications-popover w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" disabled={!unread} onClick={markAll}>Mark all as read</Button>
        </div>
        {/* React Bits AnimatedList: rows slide in, arrow keys move through them, Enter opens one. */}
        <AnimatedList
          items={notifications.map((n) => {
            const k = KIND[n.type] ?? KIND.BILL
            return {
              id: n.id,
              icon: <span className={cn("flex size-8 items-center justify-center rounded-full", k.tone)}><k.icon className="size-4" /></span>,
              title: <span className={cn("text-sm", !n.read && "font-semibold")}>{n.text}</span>,
              description: formatDistanceToNow(parseISO(n.at), { addSuffix: true }),
              meta: !n.read ? <span className="block size-2 rounded-full bg-brand" aria-label="Unread" /> : undefined,
            }
          })}
          onItemSelect={(_, i) => open(notifications[i])}
          theme={document.documentElement.classList.contains("dark") ? "dark" : "light"}
          frame={false}
          showGradients={false}
          maxHeight={340}
          className="w-full"
        />
      </PopoverContent>
    </Popover>
  )
}
