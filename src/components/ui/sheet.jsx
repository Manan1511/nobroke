// Placeholder — replace with: npx shadcn@latest add sheet --overwrite
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { createOverlay, useEscape } from "@/lib/overlay"

const { Root, Trigger, Close, useOverlay } = createOverlay()

function SheetContent({ side = "right", className, children, ...props }) {
  const { open, setOpen } = useOverlay()
  useEscape(open, () => setOpen(false))
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className={cn("absolute inset-y-0 flex w-3/4 max-w-sm flex-col gap-4 bg-background shadow-lg", side === "left" ? "left-0 border-r" : "right-0 border-l", className)} {...props}>
        {children}
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute right-4 top-4 opacity-70 hover:opacity-100">
          <X className="size-4" />
        </button>
      </div>
    </div>,
    document.body
  )
}
const SheetHeader = ({ className, ...p }) => <div className={cn("flex flex-col gap-1.5 p-4", className)} {...p} />
const SheetTitle = ({ className, ...p }) => <h2 className={cn("font-semibold", className)} {...p} />
const SheetDescription = ({ className, ...p }) => <p className={cn("text-sm text-muted-foreground", className)} {...p} />

export { Root as Sheet, Trigger as SheetTrigger, Close as SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription }
