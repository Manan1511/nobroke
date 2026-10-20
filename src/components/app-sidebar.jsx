// App sidebar built on shadcn's Sidebar: collapses to icons on desktop (Ctrl+B), slides in on phones.
import { Wallet } from "lucide-react"
import { NAV } from "@/lib/nav"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar"
import { UserAvatar } from "@/components/shared"
import { useStore } from "@/lib/store"
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
            <SidebarMenuButton size="lg" onClick={() => go("dashboard")} className="group/logo">
              <span className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Wallet className="section-icon size-4 animate-wobble group-hover/logo:animate-wobble" />
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="font-semibold">NoBroke</span>
                <span className="text-xs text-muted-foreground">Split it. Settle it.</span>
              </span>
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
                  const { label, icon: Icon, anim, hover } = NAV.find((n) => n.id === id)
                  const active = page === id
                  return (
                    <SidebarMenuItem key={id}>
                      <SidebarMenuButton isActive={active} tooltip={label} onClick={() => go(id)}>
                        <Icon className={cn("section-icon", active ? cn(anim, "text-sidebar-primary") : hover)} />
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
              <UserAvatar id="u1" className="size-8" />
              <span className="grid flex-1 text-left leading-tight">
                <span className="font-medium">You</span>
                <span className="truncate text-xs text-muted-foreground">you@example.com</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
