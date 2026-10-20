// Placeholder — replace with: npx shadcn@latest add dialog --overwrite
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { createOverlay, useEscape } from "@/lib/overlay"

const { Root, Trigger, Close, useOverlay } = createOverlay()

function DialogContent({ className, children, ...props }) {
  const { open, setOpen } = useOverlay()
  useEscape(open, () => setOpen(false))
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div role="dialog" aria-modal="true" className={cn("relative z-10 grid max-h-[90vh] w-full max-w-lg gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg", className)} {...props}>
        {children}
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100">
          <X className="size-4" />
        </button>
      </div>
    </div>,
    document.body
  )
}
const DialogHeader = ({ className, ...p }) => <div className={cn("flex flex-col gap-2 text-left", className)} {...p} />
const DialogFooter = ({ className, ...p }) => <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...p} />
const DialogTitle = ({ className, ...p }) => <h2 className={cn("text-lg font-semibold leading-none", className)} {...p} />
const DialogDescription = ({ className, ...p }) => <p className={cn("text-sm text-muted-foreground", className)} {...p} />

export { Root as Dialog, Trigger as DialogTrigger, Close as DialogClose, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
