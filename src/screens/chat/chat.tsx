import { Fragment, useMemo, useState } from "react"
import { CameraIcon, HeartIcon, LockIcon, MapPinIcon, SendHorizontalIcon, SettingsIcon } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Marker, MarkerContent } from "@/components/ui/marker"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Mark } from "@/components/brand"
import { askLocation, lock, sendNudge, sendText, typing, useApp, type ChatMsg } from "@/lib/engine"
import { cn } from "@/lib/utils"
import { Camera } from "./camera"
import { HeartBurst } from "./heart-burst"
import { MessageRow } from "./message-row"
import { Settings } from "./settings"
import { SnapViewer } from "./snap-viewer"

function dayLabel(ts: number) {
  const d = new Date(ts)
  const today = new Date()
  const y = new Date()
  y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return "Today"
  if (d.toDateString() === y.toDateString()) return "Yesterday"
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" })
}

export function Chat() {
  const { messages, partnerName, peerOnline, peerTyping, connected, timerHours } = useApp()
  const [text, setText] = useState("")
  const [camera, setCamera] = useState(false)
  const [settings, setSettings] = useState(false)
  const [viewing, setViewing] = useState<ChatMsg | null>(null)

  const lastMine = useMemo(() => [...messages].reverse().find((m) => m.from === "me" && m.status)?.id, [messages])
  const lastLoc = useMemo(() => {
    const locs = messages.filter((m) => m.k === "loc")
    return {
      me: locs.filter((m) => m.from === "me").at(-1),
      them: locs.filter((m) => m.from === "them").at(-1),
    }
  }, [messages])

  const status = !connected
    ? "Offline. Messages will send when you're back"
    : peerTyping
      ? "typing…"
      : peerOnline
        ? "here now"
        : timerHours
          ? `Chats clear after ${timerHours === 24 ? "24 hours" : "7 days"}`
          : "Chats are kept"

  async function submit() {
    const t = text.trim()
    if (!t) return
    setText("")
    try {
      await sendText(t)
    } catch {
      setText(t)
      toast.error("Couldn't send. Try again.")
    }
  }

  return (
    <main className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b px-3 pt-safe pb-3">
        <Avatar className="size-11">
          <AvatarFallback className="bg-rani font-heading text-lg font-bold text-rani-foreground">
            {partnerName.slice(0, 1).toUpperCase() || "♥"}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-xl leading-tight font-bold">{partnerName}</h1>
          <span
            className={cn(
              "flex items-center gap-1.5 truncate text-xs text-muted-foreground",
              (peerOnline || peerTyping) && connected && "text-primary",
            )}
          >
            {peerOnline && connected && <span className="size-1.5 rounded-full bg-primary" />}
            {status}
          </span>
        </div>
        <Button variant="ghost" size="icon-lg" aria-label={`Ask where ${partnerName} is`} onClick={() => void askLocation()}>
          <MapPinIcon />
        </Button>
        <Button variant="ghost" size="icon-lg" aria-label="Settings" onClick={() => setSettings(true)}>
          <SettingsIcon />
        </Button>
        <Button variant="ghost" size="icon-lg" aria-label="Lock now" onClick={lock}>
          <LockIcon />
        </Button>
      </header>

      <div className="relative min-h-0 flex-1">
        {messages.length === 0 ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia>
                <Mark className="size-16" />
              </EmptyMedia>
              <EmptyTitle className="font-heading text-2xl">Just you two in here</EmptyTitle>
              <EmptyDescription>
                Say something, send a snap, or tap the heart to let {partnerName} know you're thinking of them.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <MessageScrollerProvider autoScroll defaultScrollPosition="end">
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent className="gap-3 px-3 py-4">
                  {messages.map((m, i) => {
                    const newDay = i === 0 || dayLabel(messages[i - 1].ts) !== dayLabel(m.ts)
                    return (
                      <Fragment key={m.id}>
                        {newDay && (
                          <MessageScrollerItem messageId={`day-${m.id}`}>
                            <Marker variant="separator">
                              <MarkerContent>{dayLabel(m.ts)}</MarkerContent>
                            </Marker>
                          </MessageScrollerItem>
                        )}
                        <MessageScrollerItem messageId={m.id} scrollAnchor={m.from === "me"}>
                          <MessageRow
                            m={m}
                            partner={partnerName}
                            showStatus={m.id === lastMine}
                            lastLoc={lastLoc}
                            onOpenSnap={setViewing}
                          />
                        </MessageScrollerItem>
                      </Fragment>
                    )
                  })}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        )}
      </div>

      <form
        className="flex items-center gap-2 border-t px-3 pt-3 pb-safe"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Button
          type="button"
          size="icon-lg"
          aria-label="Send a snap"
          className="size-12 rounded-full bg-rani text-rani-foreground hover:bg-rani/85"
          onClick={() => setCamera(true)}
        >
          <CameraIcon className="size-5" />
        </Button>
        <Input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            typing()
          }}
          placeholder="Message"
          aria-label="Message"
          autoComplete="off"
          enterKeyHint="send"
          maxLength={4000}
          className="h-12 rounded-full px-4 text-base"
        />
        {text.trim() ? (
          <Button type="submit" size="icon-lg" aria-label="Send" className="size-12 rounded-full">
            <SendHorizontalIcon className="size-5" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon-lg"
            variant="secondary"
            aria-label={`Nudge ${partnerName}`}
            className="size-12 rounded-full text-rani"
            onClick={() => {
              navigator.vibrate?.(20)
              void sendNudge()
            }}
          >
            <HeartIcon className="size-5 fill-current" />
          </Button>
        )}
      </form>

      {camera && <Camera onClose={() => setCamera(false)} />}
      {viewing && <SnapViewer m={viewing} onClose={() => setViewing(null)} />}
      <Settings open={settings} onOpenChange={setSettings} />
      <HeartBurst />
    </main>
  )
}
