import { useId } from "react"
import { cn } from "@/lib/utils"

// The mark: two people as two circles. The part they share is marigold and
// holds a keyhole: the overlap is the secret.
export function Mark({ className, title }: { className?: string; title?: string }) {
  const clip = useId()
  return (
    <svg viewBox="0 0 64 64" className={cn("size-10", className)} role={title ? "img" : undefined} aria-hidden={!title}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={clip}>
          <circle cx="24" cy="32" r="16" />
        </clipPath>
      </defs>
      <circle cx="24" cy="32" r="16" fill="var(--rani, #e5307e)" />
      <circle cx="40" cy="32" r="16" fill="#a996c4" />
      <circle cx="40" cy="32" r="16" fill="var(--primary, #ffb627)" clipPath={`url(#${clip})`} />
      <circle cx="32" cy="28.6" r="2.9" fill="#1f1030" />
      <path d="M30.7 30.2 L29.7 38 H34.3 L33.3 30.2 Z" fill="#1f1030" />
    </svg>
  )
}

export function Wordmark({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Mark className={markClassName} />
      <span className="font-heading text-[1.6em] leading-none font-extrabold tracking-tight">raaz</span>
    </span>
  )
}
