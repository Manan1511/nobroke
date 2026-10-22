// Small building blocks shared by the forms: ₹ amount box, split-mode toggle, date picker,
// people picker (combobox), simple select and the hover card shown on people's names.
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { CalendarIcon, Check, ChevronsUpDown, Equal, ListOrdered, ShieldCheck, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { UserAvatar } from "@/components/shared"
import { useStore } from "@/lib/store"
import { cn, inr } from "@/lib/utils"
import type { ComponentProps, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import type { SplitMode } from "@/types"

export function AmountInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon><InputGroupText>₹</InputGroupText></InputGroupAddon>
      <InputGroupInput type="number" min="0" step="0.01" placeholder="0.00" inputMode="decimal" {...props} />
    </InputGroup>
  )
}

const SPLITS: { value: SplitMode; label: string; icon: LucideIcon }[] = [
  { value: "EQUAL", label: "Equal", icon: Equal },
  { value: "EXACT", label: "Exact amounts", icon: ListOrdered },
  { value: "INCOME_RATIO", label: "By income", icon: ShieldCheck },
]
export function SplitModeToggle({ value, onValueChange }: { value: SplitMode; onValueChange: (v: SplitMode) => void }) {
  return (
    <ToggleGroup type="single" variant="outline" value={value} onValueChange={(v) => v && onValueChange(v as SplitMode)} className="w-full" aria-label="Split">
      {SPLITS.map(({ value: v, label, icon: Icon }) => (
        <ToggleGroupItem key={v} value={v} className="flex-1 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"><Icon /> {label}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

// value / onChange use "YYYY-MM-DD" strings, the same shape the API uses.
export function DatePicker({ id, value, onChange, placeholder = "Pick a date", disabled = false }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const date = value ? parseISO(value) : undefined
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} variant="outline" disabled={disabled} className={cn("w-full justify-start font-normal", !date && "text-muted-foreground")}>
          <CalendarIcon /> {date ? format(date, "d MMM yyyy") : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={date} defaultMonth={date} onSelect={(d) => { if (d) onChange(format(d, "yyyy-MM-dd")); setOpen(false) }} />
      </PopoverContent>
    </Popover>
  )
}

// Combobox: search and tick several people.
export function PeoplePicker({ options, value, onChange, placeholder = "Add people" }: { options: string[]; value: string[]; onChange: (ids: string[]) => void; placeholder?: string }) {
  const { userName } = useStore()
  const [open, setOpen] = useState(false)
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
  return (
    <div className="grid gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal text-muted-foreground">
            {value.length ? `${value.length} selected` : placeholder}<ChevronsUpDown className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Search friends…" />
            <CommandList>
              <CommandEmpty>No friend with that name.</CommandEmpty>
              <CommandGroup>
                {options.map((id) => (
                  <CommandItem key={id} value={userName(id)} onSelect={() => toggle(id)}>
                    <UserAvatar id={id} className="size-6" /> {userName(id)}
                    <Check className={cn("ml-auto", value.includes(id) ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1 pr-1">
              {userName(id)}
              <button type="button" aria-label={`Remove ${userName(id)}`} onClick={() => toggle(id)} className="rounded-sm hover:bg-background/60"><X /></button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

// options: [{ value, label }]
export function SimpleSelect({ id, value, onValueChange, options, placeholder = "Choose…", className }: { id?: string; value: string; onValueChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; className?: string }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} className={cn("w-full", className)}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

// A person's name that shows your balance with them and their trust limits on hover.
export function PersonHover({ id, children }: { id: string; children?: ReactNode }) {
  const { users, dashboardBalances, friendships, me, userName } = useStore()
  if (id === me) return <>{children ?? userName(id)}</>
  const user = users.find((u) => u.user_id === id)
  const net = Number(dashboardBalances.find((balance) => balance.user_id === id)?.net_amount ?? 0)
  const f = friendships.find((x) => x.friend_id === id)
  return (
    <HoverCard openDelay={250}>
      <HoverCardTrigger asChild>
        <span className="cursor-default underline decoration-dotted decoration-muted-foreground/50 underline-offset-4">{children ?? userName(id)}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-64">
        <div className="flex gap-3">
          <UserAvatar id={id} className="size-10" />
          <div className="grid gap-1 text-sm">
            <div className="font-medium">{user?.name}</div>
            <div className="text-xs text-muted-foreground">@{user?.username}</div>
            <div className={cn("font-medium tabular-nums", net < 0 ? "text-negative" : net > 0 ? "text-positive" : "text-muted-foreground")}>
              {net < 0 ? `You owe ${inr(-net)}` : net > 0 ? `Owes you ${inr(net)}` : "All square"}
            </div>
            <div className="text-xs text-muted-foreground">
              {f ? (f.status === "ACTIVE" ? `Trust limit you gave: ${inr(f.credit_limit_me_to_them)}` : f.status === "PENDING" ? "Friend request pending" : "Blocked") : "Not in your friends yet"}
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
