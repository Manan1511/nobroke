// Placeholder — replace with: npx shadcn@latest add tabs --overwrite
import { createContext, useContext, useState } from "react"
import { cn } from "@/lib/utils"

const Ctx = createContext(null)

function Tabs({ value, defaultValue, onValueChange, className, ...props }) {
  const [inner, setInner] = useState(defaultValue)
  const current = value ?? inner
  const set = (v) => { if (value === undefined) setInner(v); onValueChange?.(v) }
  return <Ctx.Provider value={{ current, set }}><div className={cn("flex flex-col gap-2", className)} {...props} /></Ctx.Provider>
}
const TabsList = ({ className, ...p }) => <div role="tablist" className={cn("inline-flex h-9 w-fit items-center rounded-lg bg-muted p-[3px] text-muted-foreground", className)} {...p} />
function TabsTrigger({ value, className, ...props }) {
  const { current, set } = useContext(Ctx)
  const active = current === value
  return <button type="button" role="tab" aria-selected={active} onClick={() => set(value)} className={cn("inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors", active && "bg-background text-foreground shadow-sm", className)} {...props} />
}
function TabsContent({ value, className, ...props }) {
  const { current } = useContext(Ctx)
  if (current !== value) return null
  return <div role="tabpanel" className={cn("flex-1", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
