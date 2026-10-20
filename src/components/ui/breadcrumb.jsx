import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
const Breadcrumb = (p) => <nav aria-label="breadcrumb" {...p} />
const BreadcrumbList = ({ className, ...p }) => <ol className={cn("flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground", className)} {...p} />
const BreadcrumbItem = ({ className, ...p }) => <li className={cn("inline-flex items-center gap-1.5", className)} {...p} />
const BreadcrumbLink = ({ className, ...p }) => <a className={cn("cursor-pointer hover:text-foreground", className)} {...p} />
const BreadcrumbPage = ({ className, ...p }) => <span aria-current="page" className={cn("font-normal text-foreground", className)} {...p} />
const BreadcrumbSeparator = () => <li role="presentation" className="[&>svg]:size-3.5"><ChevronRight /></li>
export { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator }
