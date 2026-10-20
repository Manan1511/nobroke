// Placeholder — replace with: npx shadcn@latest add tooltip --overwrite
import { cn } from "@/lib/utils"
const TooltipProvider = ({ children }) => children
const Tooltip = ({ children }) => <span className="group relative inline-flex">{children}</span>
const TooltipTrigger = ({ asChild, children, ...p }) => (asChild ? children : <span {...p}>{children}</span>)
const TooltipContent = ({ className, ...p }) => (
  <span role="tooltip" className={cn("pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-max max-w-xs -translate-x-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs text-background group-hover:block group-focus-within:block", className)} {...p} />
)
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
