import { cn } from "@/lib/utils"
const Avatar = ({ className, ...p }) => <span className={cn("relative flex size-8 shrink-0 overflow-hidden rounded-full", className)} {...p} />
const AvatarImage = ({ className, ...p }) => <img className={cn("aspect-square size-full", className)} {...p} />
const AvatarFallback = ({ className, ...p }) => <span className={cn("flex size-full items-center justify-center rounded-full bg-muted text-xs font-medium", className)} {...p} />
export { Avatar, AvatarImage, AvatarFallback }
