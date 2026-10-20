// Placeholder built on <details> — replace with: npx shadcn@latest add accordion --overwrite
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
const Accordion = ({ type, collapsible, className, ...p }) => <div className={cn("w-full", className)} {...p} />
const AccordionItem = ({ value, className, ...p }) => <details className={cn("group border-b last:border-b-0", className)} {...p} />
const AccordionTrigger = ({ className, children, ...p }) => (
  <summary className={cn("flex cursor-pointer list-none items-center justify-between py-4 text-sm font-medium hover:underline [&::-webkit-details-marker]:hidden", className)} {...p}>
    {children}
    <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
  </summary>
)
const AccordionContent = ({ className, ...p }) => <div className={cn("pb-4 text-sm text-muted-foreground", className)} {...p} />
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
