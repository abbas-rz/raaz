import { useEffect, useState } from "react"
import { useApp } from "@/lib/engine"

const EMOJI = ["💛", "💗", "🧡", "💖"]

// Stable pseudo-random numbers, so each burst looks different but renders purely.
const rand = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280
  return x - Math.floor(x)
}

// When they nudge you, hearts float up the screen for a moment.
export function HeartBurst() {
  const burst = useApp((s) => s.burst)
  const [finished, setFinished] = useState(0)

  useEffect(() => {
    if (!burst) return
    navigator.vibrate?.([30, 60, 30])
    const t = setTimeout(() => setFinished(burst), 3600)
    return () => clearTimeout(t)
  }, [burst])

  if (!burst || finished === burst) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      {Array.from({ length: 16 }, (_, i) => (
        <span
          key={`${burst}-${i}`}
          className="absolute bottom-0"
          style={{
            left: `${5 + rand(burst * 31 + i) * 90}%`,
            fontSize: 22 + rand(burst * 17 + i * 3) * 26,
            animation: `raaz-float 2.6s ease-out ${rand(burst * 7 + i * 5) * 0.8}s both`,
          }}
        >
          {EMOJI[i % EMOJI.length]}
        </span>
      ))}
    </div>
  )
}
