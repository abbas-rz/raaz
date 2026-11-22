import { useRef } from "react"
import { CheckCheckIcon, CheckIcon, ClockIcon, EyeIcon, ImageIcon, MapPinIcon, SparklesIcon } from "lucide-react"
import { toast } from "sonner"
import { Bubble, BubbleContent, BubbleReactions } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Marker, MarkerContent } from "@/components/ui/marker"
import { Message, MessageContent, MessageFooter } from "@/components/ui/message"
import { declineLocation, react, shareLocation, type ChatMsg } from "@/lib/engine"
import { holdLock } from "@/lib/guard"
import { dataUrl, distance, formatDistance, getPosition } from "@/lib/media"
import { cn } from "@/lib/utils"

const time = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

function Status({ m }: { m: ChatMsg }) {
  if (m.from !== "me" || !m.status) return null
  if (m.status === "queued")
    return (
      <span className="flex items-center gap-1">
        <ClockIcon className="size-3" /> Waiting for signal
      </span>
    )
  if (m.status === "sent")
    return (
      <span className="flex items-center gap-1">
        <CheckIcon className="size-3" /> Sent
      </span>
    )
  return (
    <span className="flex items-center gap-1">
      <CheckCheckIcon className="size-3" /> Delivered
    </span>
  )
}

interface RowProps {
  m: ChatMsg
  partner: string
  showStatus: boolean
  lastLoc: { me?: ChatMsg; them?: ChatMsg }
  onOpenSnap: (m: ChatMsg) => void
}

export function MessageRow({ m, partner, showStatus, lastLoc, onOpenSnap }: RowProps) {
  const align = m.from === "me" ? "end" : "start"
  const lastTap = useRef(0)

  // Double-tap a message to heart it.
  function onTap() {
    const now = Date.now()
    if (now - lastTap.current < 320) {
      void react(m.id, m.react?.me ? null : "❤️")
      lastTap.current = 0
    } else lastTap.current = now
  }

  if (m.k === "system") {
    return (
      <Marker variant="separator">
        <MarkerContent>{m.text}</MarkerContent>
      </Marker>
    )
  }

  if (m.k === "nudge") {
    return (
      <Marker variant="separator">
        <MarkerContent className="text-rani">
          {m.from === "me" ? `You nudged ${partner}` : `${partner} is thinking of you`} · {time(m.ts)}
        </MarkerContent>
      </Marker>
    )
  }

  if (m.k === "locno") {
    return (
      <Marker variant="separator">
        <MarkerContent>{m.from === "me" ? "You didn't share your location" : `${partner} didn't share their location`}</MarkerContent>
      </Marker>
    )
  }

  const reactions = [m.react?.them, m.react?.me].filter(Boolean)

  return (
    <Message align={align}>
      <MessageContent>
        {m.k === "text" && (
          <Bubble variant={m.from === "me" ? "default" : "secondary"} align={align}>
            <BubbleContent onClick={onTap} className="text-base leading-snug whitespace-pre-wrap no-select">
              {m.text}
            </BubbleContent>
            {reactions.length > 0 && (
              <BubbleReactions side="bottom" align={align === "end" ? "start" : "end"}>
                {reactions.join("")}
              </BubbleReactions>
            )}
          </Bubble>
        )}

        {m.k === "snap" && <SnapBubble m={m} partner={partner} onOpen={() => onOpenSnap(m)} onTap={onTap} />}

        {m.k === "locreq" && (
          <Bubble variant="outline" align={align}>
            <BubbleContent className="flex flex-col gap-3">
              <span className="flex items-center gap-2">
                <MapPinIcon className="size-4 text-primary" />
                {m.from === "me" ? `You asked where ${partner} is` : `${partner} wants to know where you are`}
              </span>
              {m.from === "them" && <LocationReply />}
            </BubbleContent>
          </Bubble>
        )}

        {m.k === "loc" && m.loc && <LocationBubble m={m} partner={partner} lastLoc={lastLoc} />}

        <MessageFooter className="gap-2">
          <span>{time(m.ts)}</span>
          {showStatus && <Status m={m} />}
        </MessageFooter>
      </MessageContent>
    </Message>
  )
}

function SnapBubble({ m, partner, onOpen, onTap }: { m: ChatMsg; partner: string; onOpen: () => void; onTap: () => void }) {
  const s = m.snap!
  const align = m.from === "me" ? "end" : "start"

  // Kept photos show inline for both of you.
  if (s.secs === null && s.data) {
    return (
      <Bubble variant="ghost" align={align}>
        <BubbleContent render={<button type="button" onClick={onOpen} />} className="overflow-hidden rounded-2xl p-0">
          <img
            src={dataUrl(s.mime, s.data)}
            alt={s.caption || "Photo"}
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            className="max-h-80 w-60 rounded-2xl object-cover no-select"
          />
        </BubbleContent>
        {s.caption && <p className="px-1 text-sm text-muted-foreground">{s.caption}</p>}
      </Bubble>
    )
  }

  const waiting = m.from === "them" && !!s.data && !s.openedAt
  const label =
    m.from === "them"
      ? waiting
        ? "Tap to open"
        : "Opened"
      : s.openedAt
        ? `${partner} opened it`
        : s.secs === null
          ? "Photo"
          : "Snap sent"

  return (
    <button
      type="button"
      disabled={!waiting}
      onClick={waiting ? onOpen : onTap}
      className={cn(
        "flex w-60 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        waiting
          ? "border-rani bg-rani text-rani-foreground shadow-[0_8px_30px_-8px] shadow-rani/60 active:scale-[0.97]"
          : "border-rani/40 text-muted-foreground",
        align === "end" && "self-end",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl",
          waiting ? "bg-rani-foreground/15" : "bg-rani/15 text-rani",
        )}
      >
        {waiting ? <SparklesIcon className="size-5" /> : s.openedAt ? <EyeIcon className="size-5" /> : <ImageIcon className="size-5" />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="font-heading text-lg leading-tight font-bold">{label}</span>
        <span className={cn("text-xs", waiting ? "opacity-85" : "")}>
          {s.secs ? `View once · ${s.secs}s` : "View once"}
        </span>
      </span>
    </button>
  )
}

function LocationReply() {
  return (
    <span className="flex gap-2">
      <Button
        size="sm"
        onClick={async () => {
          try {
            const p = await getPosition()
            await shareLocation(p.coords.latitude, p.coords.longitude, p.coords.accuracy)
          } catch {
            toast.error("Location is off or blocked. Allow it for raaz in your browser settings.")
          }
        }}
      >
        Share once
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void declineLocation()}>
        Not now
      </Button>
    </span>
  )
}

function LocationBubble({ m, partner, lastLoc }: { m: ChatMsg; partner: string; lastLoc: RowProps["lastLoc"] }) {
  const loc = m.loc!
  const other = m.from === "me" ? lastLoc.them : lastLoc.me
  const near =
    other?.loc && Math.abs(other.ts - m.ts) < 3600_000 ? formatDistance(distance(loc, other.loc)) : null
  const align = m.from === "me" ? "end" : "start"
  const maps = `https://www.google.com/maps/search/?api=1&query=${loc.lat.toFixed(6)},${loc.lon.toFixed(6)}`

  return (
    <Bubble variant="outline" align={align}>
      <BubbleContent className="flex w-60 flex-col gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <MapPinIcon className="size-4 text-primary" />
          {m.from === "me" ? "You shared where you are" : `Where ${partner} is`}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {loc.lat.toFixed(5)}, {loc.lon.toFixed(5)} · within {Math.round(loc.acc)} m
        </span>
        {near && <span className="font-heading text-lg font-bold text-primary">{near}</span>}
        <Button
          size="sm"
          variant="secondary"
          render={<a href={maps} target="_blank" rel="noreferrer noopener" onClick={() => holdLock(30_000)} />}
        >
          Open in Maps
        </Button>
      </BubbleContent>
    </Bubble>
  )
}
