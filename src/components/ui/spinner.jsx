import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
const Spinner = ({ className, ...p }) => <Loader2Icon role="status" aria-label="Loading" className={cn("size-4 animate-spin", className)} {...p} />
export { Spinner }
