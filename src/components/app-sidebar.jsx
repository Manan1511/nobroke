// App sidebar built on shadcn's Sidebar: collapses to icons on desktop (Ctrl+B), slides in on phones.
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

export { NAV }

const GROUPS = [
  { label: "Money", ids: ["dashboard", "groups", "expenses", "balances", "settle"] },
  { label: "Automation", ids: ["rules", "recurring"] },
  { label: "People", ids: ["friends", "profile"] },
]

export function AppSidebar({ page, onNavigate }) {
  const { obligations, friendships, rules, me } = useStore()
  const { isMobile, setOpenMobile } = useSidebar()
  const session = useSession() ?? DEMO_USER
  // Small counters next to some sections, so you can see what needs attention.
  const badges = {
    balances: obligations.filter((o) => o.debtor_id === me && o.status !== "SETTLED").length,
    rules: rules.filter((r) => r.status === "ARMED").length,
    friends: friendships.filter((f) => f.status === "PENDING").length,
  }
  const go = (id) => { onNavigate(id); if (isMobile) setOpenMobile(false) }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Same round "N" mark as the landing page; goes back to it. */}
            <SidebarMenuButton size="lg" asChild tooltip="NoBroke home" className="group/logo">
              <Link to="/">
                <span className="section-icon flex aspect-square size-8 animate-wobble items-center justify-center rounded-full bg-foreground text-[15px] font-semibold tracking-tighter text-background group-hover/logo:animate-wobble">N</span>
                <span className="grid flex-1 text-left leading-tight">
                  <span className="font-display text-xl leading-none tracking-tight">NoBroke</span>
                  <span className="text-xs text-muted-foreground">Make moves. Unbound.</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.ids.map((id) => {
                  const { label, icon: Icon, anim, hover, color, activeTint } = NAV.find((n) => n.id === id)
                  const active = page === id
                  return (
                    <SidebarMenuItem key={id}>
                      <SidebarMenuButton isActive={active} tooltip={label} onClick={() => go(id)} className={activeTint}>
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
