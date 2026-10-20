// Shown for any address NoBroke doesn't know. Same cream paper and Anton type as the landing page.
import { Link } from "react-router"
import BlurText from "@/components/bits/BlurText"
import ShinyText from "@/components/bits/ShinyText"

export default function NotFound() {
  return (
    <main className="grid min-h-svh place-items-center bg-[#f2eee6] px-4 text-center text-[#10100f]">
      <div className="grid justify-items-center gap-5">
        <h1 className="font-display text-[clamp(6rem,22vw,14rem)] leading-[0.85] tracking-tight">
          <BlurText text="404" animateBy="letters" delay={90} trigger="load" />
        </h1>
        <p className="max-w-sm text-lg font-medium">
          <ShinyText text="This page went broke. Nothing to settle here." speed={3} color="rgba(16,16,15,0.7)" shineColor="#ff4a1c" />
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/" className="inline-flex min-h-12 items-center rounded-full border border-[#10100f]/70 px-6 text-xs font-medium tracking-[0.12em] transition hover:bg-[#10100f] hover:text-[#f2eee6]">HOME</Link>
          <Link to="/app" className="inline-flex min-h-12 items-center rounded-full bg-[#10100f] px-6 text-xs font-medium tracking-[0.12em] text-[#f2eee6] transition hover:bg-[#333]">DASHBOARD →</Link>
        </div>
      </div>
    </main>
  )
}
