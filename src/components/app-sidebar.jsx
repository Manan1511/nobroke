// Simple sidebar. Later you can swap it for shadcn's Sidebar block: npx shadcn@latest add sidebar
import { LayoutDashboard, Users, Receipt, Scale, ArrowLeftRight, Workflow, Repeat, HeartHandshake, UserCog, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

// anim plays once (active page, page header); hover replays it when the pointer is over the nav item.
// Class names are written out in full so Tailwind picks them up.
export const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, anim: "animate-pop", hover: "group-hover:animate-pop" },
  { id: "groups", label: "Groups", icon: Users, anim: "animate-wiggle", hover: "group-hover:animate-wiggle" },
  { id: "expenses", label: "Expenses", icon: Receipt, anim: "animate-print", hover: "group-hover:animate-print" },
  { id: "balances", label: "Balances", icon: Scale, anim: "animate-tilt", hover: "group-hover:animate-tilt" },
  { id: "settle", label: "Settle up", icon: ArrowLeftRight, anim: "animate-swap", hover: "group-hover:animate-swap" },
  { id: "rules", label: "Pay-when-paid", icon: Workflow, anim: "animate-flow", hover: "group-hover:animate-flow" },
  { id: "recurring", label: "Recurring bills", icon: Repeat, anim: "animate-spin-once", hover: "group-hover:animate-spin-once" },
  { id: "friends", label: "Friends & trust", icon: HeartHandshake, anim: "animate-beat", hover: "group-hover:animate-beat" },
  { id: "profile", label: "Profile & privacy", icon: UserCog, anim: "animate-gear", hover: "group-hover:animate-gear" },
]

export function AppSidebar({ page, onNavigate, className }) {
  return (
    <aside className={cn("flex h-full flex-col gap-2 bg-sidebar p-3", className)}>
      <div className="group flex items-center gap-2 px-2 py-3 font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="section-icon size-4 animate-wobble group-hover:animate-wobble" />
        </span>
        NoBroke
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ id, label, icon: Icon, anim, hover }) => (
          <button key={id} type="button" onClick={() => onNavigate(id)} aria-current={page === id ? "page" : undefined}
            className={cn("group flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              page === id && "bg-accent font-medium text-accent-foreground")}>
            <Icon className={cn("section-icon size-4", page === id ? cn(anim, "text-primary") : hover)} /> {label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
