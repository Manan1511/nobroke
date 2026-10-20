// Shared open/close logic for the placeholder Dialog, AlertDialog, Sheet and DropdownMenu.
// When you replace those with real shadcn components, this file can be deleted.
import { createContext, useContext, useState, cloneElement, isValidElement, useEffect } from "react"

export function createOverlay() {
  const Ctx = createContext({ open: false, setOpen: () => {} })

  function Root({ open, onOpenChange, defaultOpen = false, children }) {
    const [inner, setInner] = useState(defaultOpen)
    const isOpen = open ?? inner
    const setOpen = (v) => {
      if (open === undefined) setInner(v)
      onOpenChange?.(v)
    }
    return <Ctx.Provider value={{ open: isOpen, setOpen }}>{children}</Ctx.Provider>
  }

  const useOverlay = () => useContext(Ctx)

  function makeButton(value) {
    return function Btn({ asChild, children, onClick, ...props }) {
      const { open, setOpen } = useOverlay()
      const next = value === "toggle" ? !open : value
      if (asChild && isValidElement(children)) {
        return cloneElement(children, {
          onClick: (e) => { children.props.onClick?.(e); setOpen(next) },
        })
      }
      return (
        <button type="button" onClick={(e) => { onClick?.(e); setOpen(next) }} {...props}>
          {children}
        </button>
      )
    }
  }

  return { Root, useOverlay, Trigger: makeButton(true), Toggle: makeButton("toggle"), Close: makeButton(false) }
}

export function useEscape(active, onEscape) {
  useEffect(() => {
    if (!active) return
    const h = (e) => e.key === "Escape" && onEscape()
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  })
}
