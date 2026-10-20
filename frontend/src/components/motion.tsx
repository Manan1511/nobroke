// NoBroke's wrappers around the React Bits components (src/components/bits), tuned to the spatial theme.
// Use these in pages instead of the raw components so every animation shares the same timing and colours.
import { useLayoutEffect, useRef, type ReactNode } from "react"
import AnimatedContent from "@/components/bits/AnimatedContent"
import CountUp from "@/components/bits/CountUp"
import GlareHover from "@/components/bits/GlareHover"
import Magnet from "@/components/bits/Magnet"
import SpotlightCard from "@/components/bits/SpotlightCard"
import { cn } from "@/lib/utils"

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

/** Children rise and un-blur in sequence when they mount (page sections, list rows). */
export function Reveal({ children, className, stagger = 0.06, delay = 0 }: { children: ReactNode; className?: string; stagger?: number; delay?: number }) {
  if (reduced()) return <div className={className}>{children}</div>
  return (
    <AnimatedContent trigger="mount" distance={16} blur={6} duration={0.5} ease="power3.out" stagger={stagger} delay={delay} className={className}>
      {children}
    </AnimatedContent>
  )
}

/**
 * Page entrance: the page header, any alert, then every card on the page come in one by one in reading
 * order (rise + un-blur + slight scale). Remount it (key) to replay when a section is opened.
 */
export function PageReveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || reduced()) return
    // Top-level blocks that aren't card grids, plus every outermost card (cards inside cards stay with their parent).
    const cards = [...el.querySelectorAll<HTMLElement>('[data-slot="card"]')].filter((c) => !c.parentElement?.closest('[data-slot="card"]'))
    const blocks = [...el.children].filter((c) => !c.querySelector('[data-slot="card"]') && c.getAttribute("data-slot") !== "card") as HTMLElement[]
    const targets = [...blocks, ...cards].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    // CSS animation (index.css .nb-rise), delayed per element; removed when done so hover effects work again.
    const done = (e: AnimationEvent) => { if (e.animationName === "nb-rise") (e.currentTarget as HTMLElement).classList.remove("nb-rise") }
    targets.forEach((t, i) => {
      t.style.setProperty("--nb-delay", `${i * 70}ms`)
      t.classList.add("nb-rise")
      t.addEventListener("animationend", done)
    })
    return () => targets.forEach((t) => { t.classList.remove("nb-rise"); t.removeEventListener("animationend", done) })
  }, [])
  return <div ref={ref} className={className}>{children}</div>
}

/** A rupee amount that counts up from zero. */
export function Money({ value, className }: { value: number; className?: string }) {
  return <CountUp to={Math.abs(value)} prefix={value < 0 ? "-₹" : "₹"} separator="," decimals={2} duration={1.1} trigger="load" className={cn("tabular-nums", className)} />
}

/** A whole number that counts up (percentages, counts). */
export function Count({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  return <CountUp to={value} suffix={suffix} duration={1.1} trigger="load" className={cn("tabular-nums", className)} />
}

/** Soft orange spotlight that follows the pointer over a glass card. */
export function Spotlight({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <SpotlightCard
      spotlightColor="rgba(255, 74, 28, 0.16)"
      className={cn("h-full rounded-[1.75rem] p-0!", className)}
      style={{ "--spotlight-card-surface": "transparent", "--spotlight-card-shadow": "none", "--spotlight-card-border": "transparent" } as React.CSSProperties}
    >
      {children}
    </SpotlightCard>
  )
}

/** A light glare that sweeps across a card on hover. */
export function Glare({ children }: { children: ReactNode }) {
  return (
    <GlareHover width="100%" height="100%" background="transparent" borderColor="transparent" borderRadius="1.75rem" glareColor="#ffffff" glareOpacity={0.35} glareSize={220} className="h-full w-full [&>*]:w-full [&>*]:self-stretch">
      {children}
    </GlareHover>
  )
}

/** Main call-to-action buttons lean towards the pointer. */
export function Magnetic({ children }: { children: ReactNode }) {
  if (reduced()) return <>{children}</>
  return <Magnet padding={40} magnetStrength={4} maxOffset={8} wrapperClassName="inline-flex">{children}</Magnet>
}
