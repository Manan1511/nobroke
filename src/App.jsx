import { useState } from "react"
import { Menu, Moon, Sun, LogOut, UserCog } from "lucide-react"
import { toast } from "sonner"
import { AppSidebar, NAV } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Toaster } from "@/components/ui/sonner"
import { UserAvatar } from "@/components/shared"
import Dashboard from "@/pages/Dashboard"
import Groups from "@/pages/Groups"
import Expenses from "@/pages/Expenses"
import Balances from "@/pages/Balances"
import SettleUp from "@/pages/SettleUp"
import PayRules from "@/pages/PayRules"
import Recurring from "@/pages/Recurring"
import Friends from "@/pages/Friends"
import Profile from "@/pages/Profile"

const PAGES = { dashboard: Dashboard, groups: Groups, expenses: Expenses, balances: Balances, settle: SettleUp, rules: PayRules, recurring: Recurring, friends: Friends, profile: Profile }

export default function App() {
  const [page, setPage] = useState("dashboard")
  const [menuOpen, setMenuOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const Page = PAGES[page]
  const go = (p) => { setPage(p); setMenuOpen(false); window.scrollTo(0, 0) }
  const toggleDark = () => { document.documentElement.classList.toggle("dark"); setDark((d) => !d) }

  return (
    <div className="flex min-h-screen">
      <AppSidebar page={page} onNavigate={go} className="sticky top-0 hidden h-screen w-60 shrink-0 border-r md:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4">
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu"><Menu /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <AppSidebar page={page} onNavigate={go} />
            </SheetContent>
          </Sheet>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem><BreadcrumbLink onClick={() => go("dashboard")}>NoBroke</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem><BreadcrumbPage>{NAV.find((n) => n.id === page)?.label}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleDark} aria-label="Toggle dark mode">{dark ? <Sun /> : <Moon />}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Account menu" className="rounded-full"><UserAvatar id="u1" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>you@example.com</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => go("profile")}><UserCog /> Profile & privacy</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => toast("Signed out (mock)")}><LogOut /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 md:p-8">
          <Page onNavigate={go} />
        </main>
      </div>
      <Toaster />
    </div>
  )
}
