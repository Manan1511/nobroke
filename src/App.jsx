import { useEffect, useState } from "react"
import { Moon, Sun, LogOut, UserCog, Search, Plus } from "lucide-react"
import { toast } from "sonner"
import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Toaster } from "@/components/ui/sonner"
import { UserAvatar } from "@/components/shared"
import { NotificationsMenu } from "@/components/notifications-menu"
import { NAV } from "@/lib/nav"
import { useStore } from "@/lib/store"
import { inr } from "@/lib/utils"
import Dashboard from "@/pages/Dashboard"
import Groups from "@/pages/Groups"
import Expenses from "@/pages/Expenses"
import Balances from "@/pages/Balances"
import SettleUp from "@/pages/SettleUp"
import PayRules from "@/pages/PayRules"
import Recurring from "@/pages/Recurring"
import Friends from "@/pages/Friends"
import Profile from "@/pages/Profile"

// Light / dark mode: a class on <html>, remembered in this browser when storage is available.
function useDarkMode() {
  const [dark, setDark] = useState(() => { try { return localStorage.getItem("nobroke-theme") === "dark" } catch { return false } })
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    try { localStorage.setItem("nobroke-theme", dark ? "dark" : "light") } catch { /* storage blocked: fine */ }
  }, [dark])
  return [dark, setDark]
}

const PAGES = { dashboard: Dashboard, groups: Groups, expenses: Expenses, balances: Balances, settle: SettleUp, rules: PayRules, recurring: Recurring, friends: Friends, profile: Profile }

// Ctrl+K / ⌘K: jump to any section, group or expense.
function CommandMenu({ open, setOpen, go }) {
  const { groups, expenses } = useStore()
  useEffect(() => {
    const h = (e) => { if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((o) => !o) } }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [setOpen])
  const run = (fn) => { setOpen(false); fn() }
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Search NoBroke" description="Jump to a page, group or expense">
      <CommandInput placeholder="Search pages, groups, expenses…" />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {NAV.map(({ id, label, icon: Icon }) => (
            <CommandItem key={id} value={label} onSelect={() => run(() => go(id))}><Icon /> {label}</CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Groups">
          {groups.map((g) => <CommandItem key={g.group_id} value={`group ${g.group_name}`} onSelect={() => run(() => go("groups"))}>{g.group_name}</CommandItem>)}
        </CommandGroup>
        <CommandGroup heading="Expenses">
          {expenses.map((e) => (
            <CommandItem key={e.expense_id} value={`expense ${e.title}`} onSelect={() => run(() => go("expenses"))}>
              {e.title}<span className="ml-auto text-xs text-muted-foreground tabular-nums">{inr(e.total_amount)}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

export default function App() {
  const [page, setPage] = useState("dashboard")
  const [searchOpen, setSearchOpen] = useState(false)
  const [dark, setDark] = useDarkMode()
  const Page = PAGES[page]
  const go = (p) => { setPage(p); window.scrollTo(0, 0) }

  return (
    <SidebarProvider>
      <AppSidebar page={page} onNavigate={go} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden sm:block"><BreadcrumbLink className="cursor-pointer" onClick={() => go("dashboard")}>NoBroke</BreadcrumbLink></BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:block" />
              <BreadcrumbItem><BreadcrumbPage>{NAV.find((n) => n.id === page)?.label}</BreadcrumbPage></BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden w-56 justify-start text-muted-foreground md:flex" onClick={() => setSearchOpen(true)}>
              <Search /> Search…
              <KbdGroup className="ml-auto"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></KbdGroup>
            </Button>
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSearchOpen(true)} aria-label="Search"><Search /></Button>
            <Button size="sm" className="hidden sm:flex" onClick={() => go("expenses")}><Plus /> Expense</Button>
            <NotificationsMenu onNavigate={go} />
            <Button variant="ghost" size="icon" onClick={() => setDark((d) => !d)} aria-label="Toggle dark mode">{dark ? <Sun /> : <Moon />}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Account menu" className="rounded-full"><UserAvatar id="u1" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
      </SidebarInset>
      <CommandMenu open={searchOpen} setOpen={setSearchOpen} go={go} />
      <Toaster theme={dark ? "dark" : "light"} />
    </SidebarProvider>
  )
}
