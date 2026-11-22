import { useEffect, useState } from "react"
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp"
import { CopyIcon, Share2Icon, ArrowLeftIcon, ShieldCheckIcon } from "lucide-react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { Mark } from "@/components/brand"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { CODE_LENGTH, formatCode, isValidCode, newInviteCode, normalizeCode } from "@/core/code"
import { INVITE_TTL_MS } from "@/core/protocol"
import { completePairing, dismissNotice, useApp } from "@/lib/engine"
import { holdLock, releaseLock } from "@/lib/guard"
import { cancelInvite, hostInvite, joinInvite, PairingError, type Paired } from "@/lib/pairing"

type Step = { s: "choose" } | { s: "host"; code: string } | { s: "join" } | { s: "verify"; paired: Paired }

const REASONS: Record<PairingError["reason"], string> = {
  expired: "That code has expired or doesn't exist. Ask them for a fresh one.",
  taken: "Someone already used that code. Make a new one.",
  tampered: "The code didn't check out, so nothing was connected. Make a new code and try again.",
  network: "Couldn't reach raaz. Check your internet and try again.",
  cancelled: "",
}

// A join link (raaz.app/#join=CODE) is read once at startup.
let linkCode: string | null = null
if (typeof location !== "undefined") {
  const m = location.hash.match(/join=([0-9A-Za-z-]+)/)
  if (m && isValidCode(m[1])) linkCode = normalizeCode(m[1])
  if (m) history.replaceState(null, "", location.pathname)
}

export function Pair() {
  const [step, setStep] = useState<Step>(linkCode ? { s: "join" } : { s: "choose" })
  const notice = useApp((s) => s.notice)

  return (
    <main className="flex h-full flex-col px-6 pt-safe pb-safe">
      {step.s !== "choose" && step.s !== "verify" && (
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 self-start"
          aria-label="Back"
          onClick={() => setStep({ s: "choose" })}
        >
          <ArrowLeftIcon />
        </Button>
      )}

      {step.s === "choose" && (
        <div className="flex flex-1 flex-col justify-center gap-8">
          {notice && (
            <Alert>
              <AlertTitle>It's over</AlertTitle>
              <AlertDescription className="flex flex-col gap-2">
                {notice}
                <Button variant="link" className="h-auto self-start p-0" onClick={dismissNotice}>
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <Mark className="size-16" />
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl leading-none font-extrabold">Connect with them</h1>
            <p className="text-muted-foreground">One of you makes a code. The other types it in. That's the whole setup.</p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              size="lg"
              className="h-14 rounded-full text-lg font-semibold"
              onClick={() => setStep({ s: "host", code: newInviteCode() })}
            >
              Make a code
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-14 rounded-full text-lg font-semibold"
              onClick={() => setStep({ s: "join" })}
            >
              I have a code
            </Button>
          </div>
        </div>
      )}

      {step.s === "host" && (
        <Host
          key={step.code}
          code={step.code}
          onPaired={(paired) => setStep({ s: "verify", paired })}
          onRetry={() => setStep({ s: "host", code: newInviteCode() })}
        />
      )}
      {step.s === "join" && <Join onPaired={(paired) => setStep({ s: "verify", paired })} />}
      {step.s === "verify" && <Verify paired={step.paired} onReject={() => setStep({ s: "choose" })} />}
    </main>
  )
}

function Host({ code, onPaired, onRetry }: { code: string; onPaired: (p: Paired) => void; onRetry: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [left, setLeft] = useState(INVITE_TTL_MS)
  const [started] = useState(() => Date.now())

  useEffect(() => {
    const ctrl = new AbortController()
    hostInvite(code, ctrl.signal)
      .then(onPaired)
      .catch((e: unknown) => {
        if (e instanceof PairingError && e.reason === "cancelled") return
        if (e instanceof PairingError && e.reason === "taken") return onRetry()
        setError(e instanceof PairingError ? REASONS[e.reason] : "Something went wrong. Make a new code.")
      })
    const tick = setInterval(() => setLeft(INVITE_TTL_MS - (Date.now() - started)), 1000)
    return () => {
      ctrl.abort()
      clearInterval(tick)
      void cancelInvite(code)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const link = `${location.origin}/#join=${code}`
  const mins = Math.max(0, Math.floor(left / 60000))
  const secs = Math.max(0, Math.floor((left % 60000) / 1000))

  async function share() {
    holdLock()
    try {
      if (navigator.share) {
        await navigator.share({ title: "raaz", text: `Join me on raaz. Code: ${formatCode(code)}`, url: link })
      } else {
        await navigator.clipboard.writeText(link)
        toast.success("Link copied")
      }
    } catch {
      /* closed the share sheet */
    } finally {
      releaseLock()
    }
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl leading-none font-extrabold">Your code</h1>
        <p className="text-muted-foreground">Send it to them, or let them type it on their phone. It works once.</p>
      </div>

      <motion.button
        type="button"
        initial={{ rotate: -2, scale: 0.9, opacity: 0 }}
        animate={{ rotate: 0, scale: 1, opacity: 1 }}
        onClick={() => {
          void navigator.clipboard?.writeText(formatCode(code)).then(() => toast.success("Code copied"))
        }}
        className="flex flex-col items-center gap-2 rounded-3xl bg-primary px-4 py-7 text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label={`Code ${formatCode(code)}. Tap to copy.`}
      >
        <span className="font-heading text-5xl font-extrabold tracking-wider tabular-nums">{formatCode(code)}</span>
        <span className="flex items-center gap-1.5 text-sm font-medium opacity-75">
          <CopyIcon className="size-3.5" /> Tap to copy
        </span>
      </motion.button>

      <Button size="lg" variant="secondary" className="h-12 rounded-full" onClick={() => void share()}>
        <Share2Icon data-icon="inline-start" />
        Send them a link
      </Button>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Not connected</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            {error}
            <Button size="sm" className="self-start" onClick={onRetry}>
              Make a new code
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex items-center gap-3 text-muted-foreground">
          <Spinner className="text-primary" />
          <span>
            Waiting for them to join · expires in {mins}:{String(secs).padStart(2, "0")}
          </span>
        </div>
      )}
    </div>
  )
}

function Join({ onPaired }: { onPaired: (p: Paired) => void }) {
  const [code, setCode] = useState(linkCode ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function go(value = code) {
    if (!isValidCode(value) || busy) return
    setBusy(true)
    setError(null)
    try {
      linkCode = null
      onPaired(await joinInvite(value))
    } catch (e) {
      setError(e instanceof PairingError ? REASONS[e.reason] : "Something went wrong. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-1 flex-col justify-center gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        void go()
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl leading-none font-extrabold">Type their code</h1>
        <p className="text-muted-foreground">
          {linkCode ? "We filled it in from their link. Tap Connect." : "8 letters and numbers, from their screen."}
        </p>
      </div>

      <InputOTP
        maxLength={CODE_LENGTH}
        pattern={REGEXP_ONLY_DIGITS_AND_CHARS}
        value={code}
        onChange={(v) => setCode(v.toUpperCase())}
        onComplete={(v: string) => void go(v.toUpperCase())}
        autoFocus
        inputMode="text"
        autoCapitalize="characters"
        containerClassName="justify-center"
        disabled={busy}
      >
        <InputOTPGroup>
          {[0, 1, 2, 3].map((i) => (
            <InputOTPSlot key={i} index={i} className="h-14 w-10 font-heading text-2xl font-bold" />
          ))}
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          {[4, 5, 6, 7].map((i) => (
            <InputOTPSlot key={i} index={i} className="h-14 w-10 font-heading text-2xl font-bold" />
          ))}
        </InputOTPGroup>
      </InputOTP>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Not connected</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        size="lg"
        className="h-14 rounded-full text-lg font-semibold"
        disabled={!isValidCode(code) || busy}
      >
        {busy && <Spinner data-icon="inline-start" />}
        {busy ? "Connecting" : "Connect"}
      </Button>
    </form>
  )
}

function Verify({ paired, onReject }: { paired: Paired; onReject: () => void }) {
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  return (
    <form
      className="flex flex-1 flex-col justify-center gap-8"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        await completePairing(paired.secrets, name)
        toast.success("You're connected")
      }}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl leading-none font-extrabold">Check these match</h1>
        <p className="text-muted-foreground">
          Their screen should show the same four emoji, in the same order. If it does, nobody is listening in.
        </p>
      </div>

      <div className="flex justify-between rounded-3xl bg-card px-6 py-6" aria-label="Safety emoji">
        {paired.secrets.safety.map((e, i) => (
          <motion.span
            key={i}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 + i * 0.12, type: "spring", stiffness: 300, damping: 18 }}
            className="text-5xl"
          >
            {e}
          </motion.span>
        ))}
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="partner">What do you call them?</FieldLabel>
          <Input
            id="partner"
            value={name}
            maxLength={24}
            placeholder="Their name or nickname"
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            className="h-12"
          />
          <FieldDescription>Only shown on your phone.</FieldDescription>
        </Field>
      </FieldGroup>

      <div className="flex flex-col gap-3">
        <Button type="submit" size="lg" className="h-14 rounded-full text-lg font-semibold" disabled={busy}>
          <ShieldCheckIcon data-icon="inline-start" />
          They match
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            toast.error("Not connected. Make a new code and try again, ideally side by side.")
            onReject()
          }}
        >
          They don't match
        </Button>
      </div>
    </form>
  )
}
