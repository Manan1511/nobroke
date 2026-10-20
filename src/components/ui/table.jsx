import { cn } from "@/lib/utils"

const Table = ({ className, ...p }) => (
  <div className="relative w-full overflow-x-auto">
    <table className={cn("w-full caption-bottom text-sm", className)} {...p} />
  </div>
)
const TableHeader = ({ className, ...p }) => <thead className={cn("[&_tr]:border-b", className)} {...p} />
const TableBody = ({ className, ...p }) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />
const TableFooter = ({ className, ...p }) => <tfoot className={cn("border-t bg-muted/50 font-medium", className)} {...p} />
const TableRow = ({ className, ...p }) => <tr className={cn("border-b transition-colors hover:bg-muted/50", className)} {...p} />
const TableHead = ({ className, ...p }) => <th className={cn("h-10 whitespace-nowrap px-2 text-left align-middle font-medium text-foreground", className)} {...p} />
const TableCell = ({ className, ...p }) => <td className={cn("whitespace-nowrap p-2 align-middle", className)} {...p} />
const TableCaption = ({ className, ...p }) => <caption className={cn("mt-4 text-sm text-muted-foreground", className)} {...p} />

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
