import { motion } from "motion/react"
import { Mark } from "@/components/brand"
import { Button } from "@/components/ui/button"
import { startSetup } from "@/lib/engine"

const POINTS = [
  ["No account, no number", "Just a code you share with them once."],
  ["Only your two phones can read it", "Messages are locked before they leave your phone."],
  ["Snaps that don't stay", "Open once, then they're gone from both phones."],
] as const

export function Welcome() {
  return (
    <main className="flex h-full flex-col px-6 pt-safe pb-safe">
      <div className="flex flex-1 flex-col justify-center gap-10">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 160, damping: 14 }}
          className="relative w-fit"
        >
          <div
            aria-hidden
            className="absolute -inset-6 rounded-full bg-rani/25 blur-2xl"
            style={{ animation: "raaz-breathe 5s ease-in-out infinite" }}
          />
          <Mark className="relative size-24" />
        </motion.div>

        <div className="flex flex-col gap-3">
          <h1 className="text-6xl leading-[0.9] font-extrabold tracking-tight">raaz</h1>
          <p className="max-w-[22ch] text-xl leading-snug text-muted-foreground">
            A private space for just the two of you.
          </p>
        </div>

        <ul className="flex flex-col gap-4">
          {POINTS.map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-primary" />
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Button size="lg" className="h-14 w-full rounded-full text-lg font-semibold" onClick={startSetup}>
        Set up raaz
      </Button>
    </main>
  )
}
