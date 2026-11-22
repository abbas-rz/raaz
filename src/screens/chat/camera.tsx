import { useEffect, useRef, useState } from "react"
import { ImagesIcon, RefreshCwIcon, SendHorizontalIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { sendSnap, TooBigError } from "@/lib/engine"
import { holdLock, releaseLock } from "@/lib/guard"
import { encodeFile, encodeImage } from "@/lib/media"

type Shot = { data: string; mime: string; url: string }
const TIMERS = [
  ["3", "3s"],
  ["5", "5s"],
  ["10", "10s"],
  ["keep", "Keep"],
] as const

// The live preview is a camera stream drawn to a canvas. It's never recorded
// and never handed to the camera app, so nothing lands in the gallery.
export function Camera({ onClose }: { onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [facing, setFacing] = useState<"user" | "environment">("environment")
  const [shot, setShot] = useState<Shot | null>(null)
  const [caption, setCaption] = useState("")
  const [timer, setTimer] = useState<string>("5")
  const [sending, setSending] = useState(false)
  const [noCamera, setNoCamera] = useState(false)

  useEffect(() => {
    if (shot) return
    let stream: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play().catch(() => {})
        }
      })
      .catch(() => setNoCamera(true))
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [facing, shot])

  // Drop the photo from memory when the camera closes.
  useEffect(() => () => {
    if (shot) URL.revokeObjectURL(shot.url)
  }, [shot])

  async function capture() {
    const v = video.current
    if (!v?.videoWidth) return
    try {
      setShot(await encodeImage(v, v.videoWidth, v.videoHeight, facing === "user"))
    } catch {
      toast.error("Couldn't take that photo. Try again.")
    }
  }

  async function pick(f: File | undefined) {
    releaseLock()
    if (!f) return
    try {
      setShot(await encodeFile(f))
    } catch {
      toast.error("That file couldn't be opened as a photo.")
    }
  }

  async function send() {
    if (!shot) return
    setSending(true)
    try {
      await sendSnap(shot.data, shot.mime, timer === "keep" ? null : Number(timer), caption)
      onClose()
    } catch (e) {
      toast.error(e instanceof TooBigError ? "That photo is too big. Try another." : "Couldn't send. Try again.")
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1">
        {shot ? (
          <img src={shot.url} alt="Your snap" className="size-full object-contain" />
        ) : noCamera ? (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-lg font-semibold">Camera is blocked</p>
            <p className="text-sm text-white/70">Allow camera access for raaz in your browser settings, or pick a photo instead.</p>
          </div>
        ) : (
          <video
            ref={video}
            playsInline
            muted
            className="size-full object-cover"
            style={facing === "user" ? { transform: "scaleX(-1)" } : undefined}
          />
        )}

        <div className="absolute inset-x-0 top-0 flex justify-between p-4 pt-safe">
          <Button
            variant="ghost"
            size="icon-lg"
            className="rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
            aria-label="Close camera"
            onClick={() => (shot ? setShot(null) : onClose())}
          >
            <XIcon />
          </Button>
          {!shot && !noCamera && (
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
              aria-label="Switch camera"
              onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            >
              <RefreshCwIcon />
            </Button>
          )}
        </div>

        {shot && (
          <div className="absolute inset-x-0 bottom-4 px-4">
            <Input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={120}
              placeholder="Add a caption"
              className="h-12 border-none bg-black/55 text-center text-base text-white placeholder:text-white/60"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-4 bg-black px-6 pt-4 pb-safe">
        {shot ? (
          <>
            <ToggleGroup
              value={[timer]}
              onValueChange={(v) => v[0] && setTimer(v[0])}
              variant="outline"
              aria-label="How long they can see it"
            >
              {TIMERS.map(([v, label]) => (
                <ToggleGroupItem key={v} value={v} className="px-4 text-white data-pressed:bg-rani data-pressed:text-rani-foreground">
                  {label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-white/60">
              {timer === "keep" ? "Stays in your chat until the timer clears it." : "They can open it once. Then it's gone."}
            </p>
            <Button
              size="lg"
              className="h-14 w-full rounded-full bg-rani text-lg font-semibold text-rani-foreground hover:bg-rani/85"
              disabled={sending}
              onClick={() => void send()}
            >
              {sending ? <Spinner data-icon="inline-start" /> : <SendHorizontalIcon data-icon="inline-start" />}
              Send
            </Button>
          </>
        ) : (
          <div className="flex w-full items-center justify-between pb-2">
            <Button
              variant="ghost"
              size="icon-lg"
              className="rounded-full text-white hover:bg-white/10 hover:text-white"
              aria-label="Pick from gallery"
              onClick={() => {
                holdLock()
                file.current?.click()
              }}
            >
              <ImagesIcon />
            </Button>
            <button
              type="button"
              aria-label="Take photo"
              disabled={noCamera}
              onClick={() => void capture()}
              className="size-20 rounded-full border-4 border-white bg-white/15 transition-transform outline-none focus-visible:ring-3 focus-visible:ring-ring active:scale-90 disabled:opacity-40"
            />
            <span className="size-10" />
          </div>
        )}
      </div>

      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          void pick(f)
        }}
      />
    </div>
  )
}
