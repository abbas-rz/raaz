import { useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  changePin,
  clearForBoth,
  clearMine,
  disablePush,
  enablePush,
  endRaaz,
  setPartnerName,
  setPrefs,
  setTimer,
  useApp,
} from "@/lib/engine"

function Choice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(v) => v[0] && onChange(v[0] as T)}
      variant="outline"
      aria-label={label}
      className="w-full"
    >
      {options.map(([v, text]) => (
        <ToggleGroupItem
          key={v}
          value={v}
          className="flex-1 data-pressed:bg-primary data-pressed:text-primary-foreground"
        >
          {text}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

const TIMERS = [
  ["24", "24 hours"],
  ["168", "7 days"],
  ["0", "Keep"],
] as const

export function Settings({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { partnerName, timerHours, prefs, safety } = useApp()
  const [name, setName] = useState(partnerName)
  const [confirm, setConfirm] = useState<null | "clear" | "end">(null)
  const [pinOpen, setPinOpen] = useState(false)

  async function togglePush(on: boolean) {
    if (!on) return disablePush()
    const r = await enablePush()
    if (r === "denied") toast.error("Notifications are blocked. Allow them for raaz in your browser's site settings.")
    if (r === "unsupported")
      toast.error("This browser can't show notifications. On iPhone, add raaz to your Home Screen first.")
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="select-text">
          <DrawerHeader>
            <DrawerTitle className="font-heading text-2xl">Settings</DrawerTitle>
            <DrawerDescription>Changes to the timer and clearing apply to both phones.</DrawerDescription>
          </DrawerHeader>

          <div className="overflow-y-auto px-4 pb-safe">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="partner-name">Their name</FieldLabel>
                <Input
                  id="partner-name"
                  value={name}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => name !== partnerName && void setPartnerName(name)}
                />
              </Field>

              <Field>
                <FieldLabel>Messages disappear after</FieldLabel>
                <Choice
                  label="Messages disappear after"
                  value={String(timerHours) as "24" | "168" | "0"}
                  options={TIMERS}
                  onChange={(v) => void setTimer(Number(v))}
                />
                <FieldDescription>Unopened snaps wait until they're opened.</FieldDescription>
              </Field>

              <FieldSeparator />

              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="push">Notifications</FieldLabel>
                  <FieldDescription>Never shows who it's from or what they said.</FieldDescription>
                </FieldContent>
                <Switch id="push" checked={prefs.push} onCheckedChange={(on) => void togglePush(on)} />
              </Field>

              <Field>
                <FieldLabel>Notification looks like</FieldLabel>
                <Choice
                  label="Notification style"
                  value={prefs.notify}
                  options={[
                    ["discreet", "raaz"],
                    ["decoy", "College alert"],
                  ]}
                  onChange={(notify) => void setPrefs({ notify })}
                />
                <FieldDescription>
                  {prefs.notify === "discreet"
                    ? "“raaz: Something new for you”"
                    : "A random everyday alert, like “Library: Your issued book is due soon”."}
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel>Lock screen</FieldLabel>
                <Choice
                  label="Lock screen style"
                  value={prefs.lockStyle}
                  options={[
                    ["pin", "Passcode"],
                    ["calc", "Calculator disguise"],
                  ]}
                  onChange={(lockStyle) => void setPrefs({ lockStyle })}
                />
                <FieldDescription>
                  {prefs.lockStyle === "calc"
                    ? "raaz opens as a working calculator named “Calculator”. Type your passcode, then = to get in. Hold C for 3 seconds if you forget it. The home-screen icon changes the next time you add raaz to your home screen."
                    : "raaz locks every time you leave it."}
                </FieldDescription>
              </Field>

              <Button variant="secondary" onClick={() => setPinOpen(true)}>
                Change passcode
              </Button>

              <FieldSeparator />

              <FieldSet>
                <FieldLegend variant="label">Safety emoji</FieldLegend>
                <FieldDescription>
                  Both phones show the same four. If theirs ever look different, end this raaz and pair again.
                </FieldDescription>
                <p className="text-3xl tracking-widest">{safety.join(" ")}</p>
              </FieldSet>

              <FieldSeparator />

              <FieldSet>
                <FieldLegend variant="label">What raaz can and can't see</FieldLegend>
                <FieldDescription>
                  Messages and photos are locked on your phone before they're sent, and the server deletes them as soon
                  as the other phone has them. The server still sees when a message is sent and its rough size.
                  Screenshots can't be blocked or detected in a browser, so trust each other.
                </FieldDescription>
              </FieldSet>

              <div className="flex flex-col gap-2 pb-4">
                <Button variant="outline" onClick={() => setConfirm("clear")}>
                  Clear chat
                </Button>
                <Button variant="destructive" onClick={() => setConfirm("end")}>
                  End this raaz
                </Button>
              </div>
            </FieldGroup>
          </div>
        </DrawerContent>
      </Drawer>

      <AlertDialog open={confirm === "clear"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear the chat?</AlertDialogTitle>
            <AlertDialogDescription>Cleared messages can't be brought back.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="outline" onClick={() => void clearMine().then(() => toast("Cleared on this phone"))}>
              Only my phone
            </AlertDialogAction>
            <AlertDialogAction variant="destructive" onClick={() => void clearForBoth().then(() => toast("Cleared on both phones"))}>
              Both phones
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "end"} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this raaz?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything is erased from both phones and from the server. To talk again you'll need a new code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onOpenChange(false)
                void endRaaz()
              }}
            >
              End it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChangePin open={pinOpen} onOpenChange={setPinOpen} />
    </>
  )
}

function ChangePin({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [oldPin, setOld] = useState("")
  const [newPin, setNew] = useState("")
  const [again, setAgain] = useState("")
  const [busy, setBusy] = useState(false)
  const valid = /^\d{6}$/.test(oldPin) && /^\d{6}$/.test(newPin) && newPin === again

  const pinInput = (id: string, label: string, value: string, set: (v: string) => void) => (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={value}
        onChange={(e) => set(e.target.value.replace(/\D/g, ""))}
      />
    </Field>
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) {
          setOld("")
          setNew("")
          setAgain("")
        }
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-6"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            const ok = await changePin(oldPin, newPin)
            setBusy(false)
            if (!ok) return toast.error("Your current passcode isn't right.")
            toast.success("Passcode changed")
            onOpenChange(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>Change passcode</DialogTitle>
            <DialogDescription>6 digits. Your chats stay as they are.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            {pinInput("pin-old", "Current passcode", oldPin, setOld)}
            {pinInput("pin-new", "New passcode", newPin, setNew)}
            {pinInput("pin-again", "New passcode again", again, setAgain)}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={!valid || busy}>
              Change passcode
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
