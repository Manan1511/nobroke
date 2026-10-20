import { Suspense, lazy, useEffect, useState, type ComponentType } from "react"
import { Navigate, useNavigate, useParams } from "react-router"
import { Moon, Sun, LogOut, UserCog, Search, Plus, House, LayoutDashboard, Receipt, ArrowLeftRight, HeartHandshake, Menu } from "lucide-react"
import { toast } from "sonner"
import { AppSidebar } from "@/components/app-sidebar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { SidebarProvider, SidebarInset, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from "@/components/ui/command"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Toaster } from "@/components/ui/sonner"
import { UserAvatar } from "@/components/shared"
import { NotificationsMenu } from "@/components/notifications-menu"
import { SpatialBackdrop } from "@/components/spatial-backdrop"
import { NAV, idForSlug, pathFor } from "@/lib/nav"
import { useStore } from "@/lib/store"
import { startSmoothScroll, scrollToTop } from "@/lib/smooth-scroll"
import { signOut, useSession } from "@/lib/session"
import { inr } from "@/lib/utils"
const Dashboard = lazy(() => import("@/pages/Dashboard"))
const Groups = lazy(() => import("@/pages/Groups"))
const Expenses = lazy(() => import("@/pages/Expenses"))
const Balances = lazy(() => import("@/pages/Balances"))
const SettleUp = lazy(() => import("@/pages/SettleUp"))
const PayRules = lazy(() => import("@/pages/PayRules"))
const Recurring = lazy(() => import("@/pages/Recurring"))
const Friends = lazy(() => import("@/pages/Friends"))
const Profile = lazy(() => import("@/pages/Profile"))
const NotFound = lazy(() => import("@/pages/NotFound"))

// Fetch the other sections in the background once the first one is on screen, so switching is instant.
const preloadPages = () => [import("@/pages/Groups"), import("@/pages/Expenses"), import("@/pages/Balances"), import("@/pages/SettleUp"), import("@/pages/PayRules"), import("@/pages/Recurring"), import("@/pages/Friends"), import("@/pages/Profile"), import("@/pages/Dashboard")]
import { Magnetic, PageReveal } from "@/components/motion"

// Light / dark mode: a class on <html>. Starts from the page's host theme (data-theme on <html>, set by
// viewers like the shared-link page), then the toggle choice saved in this browser, then the system setting.
const html = document.documentElement
const systemDark = window.matchMedia("(prefers-color-scheme: dark)")
const savedTheme = () => { try { return localStorage.getItem("nobroke-theme") } catch { return null } }
const startDark = () => {
  const host = html.dataset.theme
  if (host === "dark" || host === "light") return host === "dark"
  const saved = savedTheme()
  return saved ? saved === "dark" : systemDark.matches
}

function useDarkMode() {
  const [dark, setDarkState] = useState(startDark)
  const setDark = (next: boolean | ((d: boolean) => boolean)) => setDarkState((d) => {
    const v = typeof next === "function" ? next(d) : next
    try { localStorage.setItem("nobroke-theme", v ? "dark" : "light") } catch { /* storage blocked: fine */ }
    return v
  })
  useEffect(() => { html.classList.toggle("dark", dark) }, [dark])
  // Follow the host / system when they change (a viewer's theme switch, or the OS going dark at night).
  useEffect(() => {
    const fromHost = () => { const t = html.dataset.theme; if (t === "dark" || t === "light") setDarkState(t === "dark") }
    const fromSystem = (e: MediaQueryListEvent) => { if (!html.dataset.theme && !savedTheme()) setDarkState(e.matches) }
    const observer = new MutationObserver(fromHost)
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] })
    systemDark.addEventListener("change", fromSystem)
    return () => { observer.disconnect(); systemDark.removeEventListener("change", fromSystem) }
  }, [])
  return { dark, setDark }
}

const PAGES: Record<string, ComponentType<{ onNavigate: (id: string) => void }>> = { dashboard: Dashboard, groups: Groups, expenses: Expenses, balances: Balances, settle: SettleUp, rules: PayRules, recurring: Recurring, friends: Friends, profile: Profile }

// Ctrl+K / ⌘K: jump to any section, group or expense.
function CommandMenu({ open, setOpen, go }: { open: boolean; setOpen: (v: boolean | ((o: boolean) => boolean)) => void; go: (id: string) => void }) {
  const { groups, expenses } = useStore()
  useEffect(() => {
    const h = (e) => { if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setOpen((o) => !o) } }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [setOpen])
  const run = (fn: () => void) => { setOpen(false); fn() }
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Search NoBroke" description="Jump to a page, group or expense">
      <CommandInput placeholder="Search pages, groups, expenses…" />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {NAV.map(({ id, label, icon: Icon, color }) => (
            <CommandItem key={id} value={label} onSelect={() => run(() => go(id))}><Icon className={color} /> {label}</CommandItem>
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

// Phones: a floating glass tab bar with the four main sections; "More" opens the full sidebar.
const TABS = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "expenses", label: "Expenses", icon: Receipt },
  { id: "settle", label: "Settle", icon: ArrowLeftRight },
  { id: "friends", label: "Friends", icon: HeartHandshake },
]
function MobileTabBar({ page, go }: { page: string; go: (id: string) => void }) {
  const { setOpenMobile } = useSidebar()
  return (
    <nav aria-label="Main sections" className="spatial-panel fixed inset-x-3 z-40 flex items-stretch justify-around rounded-full p-1.5 md:hidden" style={{ bottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
      {TABS.map(({ id, label, icon: Icon }) => {
        const active = page === id
        const color = NAV.find((n) => n.id === id)?.color
        return (
          <button key={id} type="button" onClick={() => go(id)} aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition-colors ${active ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground"}`}>
            <Icon className={`size-5 transition-transform ${active ? `${color} scale-110` : ""}`} />{label}
          </button>
        )
      })}
      <button type="button" onClick={() => setOpenMobile(true)} className="flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium text-muted-foreground"><Menu className="size-5" />More</button>
    </nav>
  )
}

export default function App() {
  const { section } = useParams()
  const navigate = useNavigate()
  const session = useSession()
  const page = idForSlug(section)
  const [searchOpen, setSearchOpen] = useState(false)
  const { dark, setDark } = useDarkMode()
  const go = (p: string) => { navigate(pathFor(p)); scrollToTop() }
  useEffect(() => startSmoothScroll(), [])
  useEffect(() => { const t = window.setTimeout(preloadPages, 1500); return () => window.clearTimeout(t) }, [])
  useEffect(() => { if (page) document.title = `${NAV.find((n) => n.id === page)?.label} · NoBroke` }, [page])
  if (!session) return <Navigate to="/" replace /> // signed out: the landing page offers Log in / Sign up
  if (!page) return <NotFound />
  const Page = PAGES[page]

  return (
    <SidebarProvider>
      <SpatialBackdrop />
      <AppSidebar page={page} onNavigate={go} />
      <SidebarInset>
        <header className="spatial-panel sticky top-2 z-30 mx-2 mt-2 flex h-14 shrink-0 items-center gap-2 rounded-full px-3 md:mx-4">
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
            <span className="hidden sm:inline-flex"><Magnetic><Button size="sm" onClick={() => go("expenses")}><Plus /> Expense</Button></Magnetic></span>
            <NotificationsMenu onNavigate={go} />
            <Button variant="ghost" size="icon" onClick={() => setDark((d) => !d)} aria-label="Toggle dark mode">{dark ? <Sun /> : <Moon />}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Account menu" className="rounded-full"><UserAvatar id="u1" name={session.name} /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="grid gap-0.5"><span>{session.name}</span><span className="text-xs font-normal text-muted-foreground">{session.email}</span></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => go("profile")}><UserCog /> Profile & privacy</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/")}><House /> NoBroke home page</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => { signOut(); toast("Signed out"); navigate("/") }}><LogOut /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 pb-28 md:p-8">
          <Suspense fallback={<div className="h-[60vh]" aria-busy="true" />}>
            <PageReveal key={page} className="space-y-6"><Page onNavigate={go} /></PageReveal>
          </Suspense>
        </main>
      </SidebarInset>
      <MobileTabBar page={page} go={go} />
      <CommandMenu open={searchOpen} setOpen={setSearchOpen} go={go} />
      <Toaster theme={dark ? "dark" : "light"} />
    </SidebarProvider>
  )
}
