import { cn } from "@/lib/utils"
const Skeleton = ({ className, ...p }) => <div className={cn("animate-pulse rounded-md bg-accent", className)} {...p} />
export { Skeleton }
