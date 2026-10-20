import { cn } from "@/lib/utils"
function Label({ className, ...props }) {
  return <label className={cn("flex items-center gap-2 text-sm font-medium leading-none select-none", className)} {...props} />
}
export { Label }
