// Smooth page scrolling with Lenis. Off for people who ask their system for reduced motion.
import Lenis from "lenis"
import "lenis/dist/lenis.css"

let lenis = null

// Things that scroll on their own (dialogs, drop-downs, the search list, sidebar, scroll areas)
// keep normal scrolling instead of moving the page.
const NATIVE = [
  "[role=dialog]", "[role=alertdialog]", "[role=listbox]", "[role=menu]",
  "[data-radix-popper-content-wrapper]", "[data-slot=scroll-area-viewport]",
  "[cmdk-list]", "[data-sidebar=content]",
].join(",")

export function startSmoothScroll() {
  if (lenis || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {}
  lenis = new Lenis({ autoRaf: true, lerp: 0.1, wheelMultiplier: 1, prevent: (node) => !!node.closest?.(NATIVE) })

  // Radix locks the page (data-scroll-locked on <body>) while a dialog or menu is open: pause Lenis too.
  const observer = new MutationObserver(() => {
    document.body.hasAttribute("data-scroll-locked") ? lenis?.stop() : lenis?.start()
  })
  observer.observe(document.body, { attributes: true, attributeFilter: ["data-scroll-locked"] })

  return () => { observer.disconnect(); lenis?.destroy(); lenis = null }
}

export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true })
  else window.scrollTo(0, 0)
}
