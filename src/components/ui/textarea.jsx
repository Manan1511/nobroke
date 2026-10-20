import { cn } from "@/lib/utils"
function Textarea({ className, ...props }) {
  return <textarea className={cn("flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />
}
export { Textarea }
