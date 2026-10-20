// Placeholder — replace with: npx shadcn@latest add alert-dialog --overwrite
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { createOverlay, useEscape } from "@/lib/overlay"

const { Root, Trigger, useOverlay } = createOverlay()

function AlertDialogContent({ className, children, ...props }) {
  const { open, setOpen } = useOverlay()
  useEscape(open, () => setOpen(false))
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" />
      <div role="alertdialog" aria-modal="true" className={cn("relative z-10 grid w-full max-w-lg gap-4 rounded-lg border bg-background p-6 shadow-lg", className)} {...props}>
        {children}
      </div>
    </div>,
    document.body
  )
}
const AlertDialogHeader = ({ className, ...p }) => <div className={cn("flex flex-col gap-2 text-left", className)} {...p} />
const AlertDialogFooter = ({ className, ...p }) => <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...p} />
const AlertDialogTitle = ({ className, ...p }) => <h2 className={cn("text-lg font-semibold", className)} {...p} />
const AlertDialogDescription = ({ className, ...p }) => <p className={cn("text-sm text-muted-foreground", className)} {...p} />

function AlertDialogAction({ className, onClick, ...props }) {
  const { setOpen } = useOverlay()
  return <button type="button" className={cn(buttonVariants(), className)} onClick={(e) => { onClick?.(e); setOpen(false) }} {...props} />
}
function AlertDialogCancel({ className, onClick, ...props }) {
  const { setOpen } = useOverlay()
  return <button type="button" className={cn(buttonVariants({ variant: "outline" }), className)} onClick={(e) => { onClick?.(e); setOpen(false) }} {...props} />
}

export { Root as AlertDialog, Trigger as AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogFooter, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel }
