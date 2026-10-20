import { cn } from "@/lib/utils"

const Card = ({ className, ...p }) => <div className={cn("flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm", className)} {...p} />
const CardHeader = ({ className, ...p }) => <div className={cn("grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-[[data-slot=card-action]]:grid-cols-[1fr_auto]", className)} {...p} />
const CardTitle = ({ className, ...p }) => <div className={cn("font-semibold leading-none", className)} {...p} />
const CardDescription = ({ className, ...p }) => <div className={cn("text-sm text-muted-foreground", className)} {...p} />
const CardAction = ({ className, ...p }) => <div data-slot="card-action" className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)} {...p} />
const CardContent = ({ className, ...p }) => <div className={cn("px-6", className)} {...p} />
const CardFooter = ({ className, ...p }) => <div className={cn("flex items-center px-6", className)} {...p} />

export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter }
