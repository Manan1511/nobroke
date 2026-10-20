import { cn } from "@/lib/utils"
const Empty = ({ className, ...p }) => <div className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border border-dashed p-6 text-center md:p-12", className)} {...p} />
const EmptyHeader = ({ className, ...p }) => <div className={cn("flex max-w-sm flex-col items-center gap-2", className)} {...p} />
const EmptyMedia = ({ className, ...p }) => <div className={cn("mb-2 flex size-10 items-center justify-center rounded-lg bg-muted [&_svg]:size-6", className)} {...p} />
const EmptyTitle = ({ className, ...p }) => <div className={cn("text-lg font-medium", className)} {...p} />
const EmptyDescription = ({ className, ...p }) => <p className={cn("text-sm text-muted-foreground", className)} {...p} />
const EmptyContent = ({ className, ...p }) => <div className={cn("flex w-full max-w-sm flex-col items-center gap-4", className)} {...p} />
export { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent }
