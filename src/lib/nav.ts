// The app's sections: sidebar, page headers and the Ctrl+K command menu all read this list.
import { LayoutDashboard, Users, Receipt, Scale, ArrowLeftRight, Workflow, Repeat, HeartHandshake, UserCog } from "lucide-react"

// anim plays once (active page, page header); hover replays it when the pointer is over the nav item.
// slug = the section's address (/app/<slug>); color / tint = the section's own icon colour (set in index.css).
// Class names are written out in full so Tailwind picks them up.
export const NAV = [
  { id: "dashboard", slug: "", color: "text-(--nav-dashboard)", tint: "bg-(--nav-dashboard)/12", activeTint: "data-[active=true]:bg-(--nav-dashboard)/14 data-[active=true]:text-sidebar-accent-foreground", label: "Dashboard", icon: LayoutDashboard, anim: "animate-pop", hover: "group-hover/menu-item:animate-pop" },
  { id: "groups", slug: "groups", color: "text-(--nav-groups)", tint: "bg-(--nav-groups)/12", activeTint: "data-[active=true]:bg-(--nav-groups)/14 data-[active=true]:text-sidebar-accent-foreground", label: "Groups", icon: Users, anim: "animate-wiggle", hover: "group-hover/menu-item:animate-wiggle" },
  { id: "expenses", slug: "expenses", color: "text-(--nav-expenses)", tint: "bg-(--nav-expenses)/12", activeTint: "data-[active=true]:bg-(--nav-expenses)/14 data-[active=true]:text-sidebar-accent-foreground", label: "Expenses", icon: Receipt, anim: "animate-print", hover: "group-hover/menu-item:animate-print" },
  { id: "balances", slug: "balances", color: "text-(--nav-balances)", tint: "bg-(--nav-balances)/12", activeTint: "data-[active=true]:bg-(--nav-balances)/14 data-[active=true]:text-sidebar-accent-foreground", label: "Balances", icon: Scale, anim: "animate-tilt", hover: "group-hover/menu-item:animate-tilt" },
  { id: "settle", slug: "settle-up", color: "text-(--nav-settle)", tint: "bg-(--nav-settle)/12", activeTint: "data-[active=true]:bg-(--nav-settle)/14 data-[active=true]:text-sidebar-accent-foreground", label: "Settle up", icon: ArrowLeftRight, anim: "animate-swap", hover: "group-hover/menu-item:animate-swap" },
  { id: "rules", slug: "pay-when-paid", color: "text-(--nav-rules)", tint: "bg-(--nav-rules)/12", activeTint: "data-[active=true]:bg-(--nav-rules)/14 data-[active=true]:text-sidebar-accent-foreground", label: "Pay-when-paid", icon: Workflow, anim: "animate-flow", hover: "group-hover/menu-item:animate-flow" },
  { id: "recurring", slug: "recurring-bills", color: "text-(--nav-recurring)", tint: "bg-(--nav-recurring)/12", activeTint: "data-[active=true]:bg-(--nav-recurring)/14 data-[active=true]:text-sidebar-accent-foreground", label: "Recurring bills", icon: Repeat, anim: "animate-spin-once", hover: "group-hover/menu-item:animate-spin-once" },
  { id: "friends", slug: "friends", color: "text-(--nav-friends)", tint: "bg-(--nav-friends)/12", activeTint: "data-[active=true]:bg-(--nav-friends)/14 data-[active=true]:text-sidebar-accent-foreground", label: "Friends & trust", icon: HeartHandshake, anim: "animate-beat", hover: "group-hover/menu-item:animate-beat" },
  { id: "profile", slug: "profile", color: "text-(--nav-profile)", tint: "bg-(--nav-profile)/12", activeTint: "data-[active=true]:bg-(--nav-profile)/14 data-[active=true]:text-sidebar-accent-foreground", label: "Profile & privacy", icon: UserCog, anim: "animate-gear", hover: "group-hover/menu-item:animate-gear" },
]


export const pathFor = (id) => { const slug = NAV.find((n) => n.id === id)?.slug ?? ""; return slug ? `/app/${slug}` : "/app" }
export const idForSlug = (slug) => NAV.find((n) => n.slug === (slug ?? ""))?.id
