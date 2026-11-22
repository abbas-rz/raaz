import { useEffect, useRef, useState, type ReactNode } from "react"
import { DeleteIcon } from "lucide-react"
import { motion, useAnimationControls } from "motion/react"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

export const PIN_LENGTH = 6

interface Props {
  title: ReactNode
  hint?: ReactNode
  // Return false to shake and clear.
  onComplete: (pin: string) => Promise<boolean | void> | boolean | void
  footer?: ReactNode
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"] as const

export function PinPad({ title, hint, onComplete, footer }: Props) {
  const [pin, setPinState] = useState("")
  const [busy, setBusy] = useState(false)
  // The ref is the source of truth so quick taps between renders aren't lost.
  const pinRef = useRef("")
  const busyRef = useRef(false)
  const setPin = (v: string) => {
    pinRef.current = v
    setPinState(v)
  }
  const shake = useAnimationControls()

  async function press(k: string) {
    if (busyRef.current) return
    if (k === "del") return setPin(pinRef.current.slice(0, -1))
    if (pinRef.current.length >= PIN_LENGTH) return
    const next = pinRef.current + k
    setPin(next)
    if (next.length === PIN_LENGTH) {
      busyRef.current = true
      setBusy(true)
      const ok = await onComplete(next)
      busyRef.current = false
      setBusy(false)
      setPin("")
      if (ok === false) {
        navigator.vibrate?.(120)
        void shake.start({ x: [0, -14, 12, -8, 6, 0], transition: { duration: 0.4 } })
      }
    }
  }

  // Hardware keyboards work too (desktop testing, Bluetooth keyboards).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) void press(e.key)
      else if (e.key === "Backspace") void press("del")
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>

      <motion.div animate={shake} className="flex h-6 items-center gap-3" aria-live="polite">
        {busy ? (
          <Spinner className="size-5 text-primary" />
        ) : (
          Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-3.5 rounded-full border-2 border-muted-foreground/60 transition-colors",
                i < pin.length && "border-primary bg-primary",
              )}
            />
          ))
        )}
        <span className="sr-only">{pin.length} of {PIN_LENGTH} digits entered</span>
      </motion.div>

      <div className="grid w-full grid-cols-3 gap-3 no-select">
        {KEYS.map((k, i) =>
          k === "" ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => void press(k)}
              aria-label={k === "del" ? "Delete" : k}
              className="flex h-16 items-center justify-center rounded-full font-heading text-2xl font-semibold transition-[background-color,transform] outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 active:bg-secondary/80 data-[del=false]:bg-secondary/60"
              data-del={k === "del"}
            >
              {k === "del" ? <DeleteIcon className="size-6 text-muted-foreground" /> : k}
            </button>
          ),
        )}
      </div>

      {footer}
    </div>
  )
}
