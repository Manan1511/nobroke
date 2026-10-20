// The app's sections: sidebar, page headers and the Ctrl+K command menu all read this list.
import { LayoutDashboard, Users, Receipt, Scale, ArrowLeftRight, Workflow, Repeat, HeartHandshake, UserCog } from "lucide-react"

// anim plays once (active page, page header); hover replays it when the pointer is over the nav item.
// Class names are written out in full so Tailwind picks them up.
export const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, anim: "animate-pop", hover: "group-hover/menu-item:animate-pop" },
  { id: "groups", label: "Groups", icon: Users, anim: "animate-wiggle", hover: "group-hover/menu-item:animate-wiggle" },
  { id: "expenses", label: "Expenses", icon: Receipt, anim: "animate-print", hover: "group-hover/menu-item:animate-print" },
  { id: "balances", label: "Balances", icon: Scale, anim: "animate-tilt", hover: "group-hover/menu-item:animate-tilt" },
  { id: "settle", label: "Settle up", icon: ArrowLeftRight, anim: "animate-swap", hover: "group-hover/menu-item:animate-swap" },
  { id: "rules", label: "Pay-when-paid", icon: Workflow, anim: "animate-flow", hover: "group-hover/menu-item:animate-flow" },
  { id: "recurring", label: "Recurring bills", icon: Repeat, anim: "animate-spin-once", hover: "group-hover/menu-item:animate-spin-once" },
  { id: "friends", label: "Friends & trust", icon: HeartHandshake, anim: "animate-beat", hover: "group-hover/menu-item:animate-beat" },
  { id: "profile", label: "Profile & privacy", icon: UserCog, anim: "animate-gear", hover: "group-hover/menu-item:animate-gear" },
]

