import { useEffect, useRef, useState } from "react"
import { XIcon } from "lucide-react"
import { motion } from "motion/react"
import { finishSnap, type ChatMsg } from "@/lib/engine"
import { dataUrl } from "@/lib/media"

// Full-screen viewer. View-once snaps count down, then they're gone for good.
export function SnapViewer({ m, onClose }: { m: ChatMsg; onClose: () => void }) {
  const s = m.snap!
  const [src] = useState(() => (s.data ? dataUrl(s.mime, s.data) : ""))
  const total = s.secs ?? 0
  const [left, setLeft] = useState(total)
  const done = useRef(false)

  function close() {
    if (done.current) return
    done.current = true
    if (s.secs !== null && m.from === "them") void finishSnap(m.id)
    onClose()
  }

  useEffect(() => {
    if (!total) return
    const start = Date.now()
    const t = setInterval(() => {
      const remaining = total - (Date.now() - start) / 1000
      setLeft(remaining)
      if (remaining <= 0) close()
    }, 100)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Leaving the app counts as closing the snap.
  useEffect(() => {
    const onHide = () => document.hidden && close()
    document.addEventListener("visibilitychange", onHide)
    return () => document.removeEventListener("visibilitychange", onHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const R = 15
  const C = 2 * Math.PI * R

  return (
    <motion.div
      role="dialog"
      aria-label="Snap"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-50 flex flex-col bg-black no-select"
      onClick={close}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img src={src} alt={s.caption || "Snap"} draggable={false} className="size-full object-contain" />

      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-safe">
        <span className="rounded-full bg-black/50 px-3 py-1 text-sm text-white">
          {s.secs === null ? "Photo" : "View once"}
        </span>
        {total ? (
          <svg viewBox="0 0 36 36" className="size-10 -rotate-90" aria-label={`${Math.ceil(left)} seconds left`}>
            <circle cx="18" cy="18" r={R} fill="rgba(0,0,0,.5)" stroke="rgba(255,255,255,.25)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r={R}
              fill="none"
              stroke="var(--rani)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - Math.max(0, left) / total)}
            />
          </svg>
        ) : (
          <button type="button" aria-label="Close" className="rounded-full bg-black/50 p-2 text-white">
            <XIcon className="size-5" />
          </button>
        )}
      </div>

      {s.caption && (
        <p className="absolute inset-x-0 bottom-[18%] bg-black/55 px-6 py-3 text-center text-lg font-medium text-white">
          {s.caption}
        </p>
      )}
    </motion.div>
  )
}
