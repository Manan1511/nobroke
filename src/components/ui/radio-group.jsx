import { createContext, useContext, useId } from "react"
import { cn } from "@/lib/utils"
const Ctx = createContext(null)
function RadioGroup({ value, onValueChange, className, ...props }) {
  const name = useId()
  return <Ctx.Provider value={{ value, onValueChange, name }}><div role="radiogroup" className={cn("grid gap-3", className)} {...props} /></Ctx.Provider>
}
function RadioGroupItem({ value, className, ...props }) {
  const ctx = useContext(Ctx)
  return <input type="radio" name={ctx.name} value={value} checked={ctx.value === value} onChange={() => ctx.onValueChange?.(value)} className={cn("size-4 accent-primary", className)} {...props} />
}
export { RadioGroup, RadioGroupItem }
