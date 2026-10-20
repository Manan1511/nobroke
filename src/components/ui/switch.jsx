import { cn } from "@/lib/utils"
function Switch({ checked = false, onCheckedChange, className, ...props }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange?.(!checked)}
      className={cn("inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50", checked ? "bg-primary" : "bg-input", className)} {...props}>
      <span className={cn("block size-4 rounded-full bg-background shadow transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  )
}
export { Switch }
