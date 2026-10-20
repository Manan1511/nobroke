import { cn } from "@/lib/utils"
function Checkbox({ checked = false, onCheckedChange, className, ...props }) {
  return <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange?.(e.target.checked)} className={cn("size-4 shrink-0 accent-primary", className)} {...props} />
}
export { Checkbox }
