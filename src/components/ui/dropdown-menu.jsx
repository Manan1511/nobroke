// Placeholder — replace with: npx shadcn@latest add dropdown-menu --overwrite
import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { createOverlay } from "@/lib/overlay"

const { Root, Toggle, useOverlay } = createOverlay()

function DropdownMenu({ children, ...props }) {
  return <Root {...props}><Wrapper>{children}</Wrapper></Root>
}
function Wrapper({ children }) {
  const ref = useRef(null)
  const { open, setOpen } = useOverlay()
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  })
  return <div ref={ref} className="relative inline-block">{children}</div>
}
function DropdownMenuContent({ className, align = "end", ...props }) {
  const { open } = useOverlay()
  if (!open) return null
  return <div role="menu" className={cn("absolute top-full z-50 mt-1 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md", align === "end" ? "right-0" : "left-0", className)} {...props} />
}
function DropdownMenuItem({ className, onSelect, onClick, variant, ...props }) {
  const { setOpen } = useOverlay()
  return (
    <button
      type="button"
      role="menuitem"
      className={cn("flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent [&_svg]:size-4", variant === "destructive" && "text-destructive", className)}
      onClick={(e) => { onClick?.(e); onSelect?.(e); setOpen(false) }}
      {...props}
    />
  )
}
const DropdownMenuLabel = ({ className, ...p }) => <div className={cn("px-2 py-1.5 text-sm font-medium", className)} {...p} />
const DropdownMenuSeparator = ({ className, ...p }) => <div className={cn("-mx-1 my-1 h-px bg-border", className)} {...p} />

export { DropdownMenu, Toggle as DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator }
