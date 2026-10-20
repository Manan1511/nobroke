// App sidebar built on shadcn's Sidebar: collapses to icons on desktop (Ctrl+B), slides in on phones.
import { useLayoutEffect, useRef, useState } from "react"
import { Link } from "react-router"
import { NAV } from "@/lib/nav"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar"
import { UserAvatar } from "@/components/shared"
import { useStore } from "@/lib/store"
import { DEMO_USER, useSession } from "@/lib/session"
import { cn } from "@/lib/utils"
import ShinyText from "@/components/bits/ShinyText"

export { NAV }

const GROUPS = [
  { label: "Money", ids: ["dashboard", "groups", "expenses", "balances", "settle"] },
  { label: "Automation", ids: ["rules", "recurring"] },
  { label: "People", ids: ["friends", "profile"] },
]

export function AppSidebar({ page, onNavigate }: { page: string; onNavigate: (id: string) => void }) {
  const { obligations, friendships, rules, me } = useStore()
  const { isMobile, setOpenMobile } = useSidebar()
  const session = useSession() ?? DEMO_USER
  // Small counters next to some sections, so you can see what needs attention.
  const badges: Record<string, number> = {
    balances: obligations.filter((o) => o.debtor_id === me && o.status !== "SETTLED").length,
    rules: rules.filter((r) => r.status === "ARMED").length,
    friends: friendships.filter((f) => f.status === "PENDING").length,
  }
  const go = (id: string) => { onNavigate(id); if (isMobile) setOpenMobile(false) }

  // Sliding highlight: one tinted pill that glides to whichever section is open.
  const content = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ top: number; left: number; width: number; height: number; color: string } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const box = content.current
      const btn = box?.querySelector<HTMLElement>('[data-sidebar="menu-button"][data-active="true"]')
      if (!box || !btn) return setPill(null)
      const a = box.getBoundingClientRect(), b = btn.getBoundingClientRect()
      setPill({ top: b.top - a.top + box.scrollTop, left: b.left - a.left, width: b.width, height: b.height, color: `var(--nav-${page})` })
    }
    place()
    const ro = new ResizeObserver(place)
    if (content.current) ro.observe(content.current)
    return () => ro.disconnect()
  }, [page])

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Same round "N" mark as the landing page; goes back to it. */}
            <SidebarMenuButton size="lg" asChild tooltip="NoBroke home" className="group/logo">
              <Link to="/">
                <span className="section-icon flex aspect-square size-8 animate-wobble items-center justify-center rounded-full bg-foreground text-[15px] font-semibold tracking-tighter text-background group-hover/logo:animate-wobble">N</span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="font-display text-xl leading-none tracking-tight">NoBroke</span>
                  <span className="block truncate text-xs leading-tight"><ShinyText text="Make moves. Unbound." speed={3} color="var(--muted-foreground)" shineColor="var(--brand)" /></span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent ref={content} className="relative">
        {pill && (
          <span aria-hidden="true" className="pointer-events-none absolute z-0 rounded-md transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none"
            style={{ ...pill, background: `color-mix(in oklab, ${pill.color} 14%, transparent)`, boxShadow: `inset 3px 0 0 ${pill.color}` }} />
        )}
        {GROUPS.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.ids.map((id) => {
                  const { label, icon: Icon, anim, hover, color } = NAV.find((n) => n.id === id)!
                  const active = page === id
                  return (
                    <SidebarMenuItem key={id}>
                      <SidebarMenuButton isActive={active} tooltip={label} onClick={() => go(id)} className="relative z-[1] data-[active=true]:bg-transparent data-[active=true]:text-sidebar-accent-foreground">
                        <Icon className={cn("section-icon", color, active ? anim : hover)} />
                        <span>{label}</span>
                      </SidebarMenuButton>
                      {badges[id] > 0 && <SidebarMenuBadge>{badges[id]}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Profile & privacy" onClick={() => go("profile")}>
              <UserAvatar id="u1" name={session.name} className="size-8" />
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{session.name}</span>
                <span className="truncate text-xs text-muted-foreground">{session.email}</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
