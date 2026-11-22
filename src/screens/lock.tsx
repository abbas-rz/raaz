import { useState } from "react"
import { CalcLock } from "@/components/calc-lock"
import { Mark } from "@/components/brand"
import { PinPad } from "@/components/pin-pad"
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
import { unlock, useApp, wipeDevice } from "@/lib/engine"

export function Lock() {
  const style = useApp((s) => s.prefs.lockStyle)
  const [forgot, setForgot] = useState(false)
  // A few wrong tries in a row slow things down, so guessing takes a while.
  const [fails, setFails] = useState(0)

  async function attempt(pin: string) {
    if (fails >= 5) await new Promise((r) => setTimeout(r, Math.min(30, 2 ** (fails - 4)) * 1000))
    const ok = await unlock(pin)
    setFails(ok ? 0 : fails + 1)
    return ok
  }

  return (
    <main className="flex h-full flex-col items-center justify-center gap-10 px-6 pt-safe pb-safe">
      {style === "calc" ? (
        <div className="fixed inset-0 z-10 flex justify-center bg-[#111113]">
          <CalcLock onCode={attempt} onHoldClear={() => setForgot(true)} />
        </div>
      ) : (
        <>
          <Mark className="size-14" title="raaz" />
          <PinPad
            title="Welcome back"
            hint={fails >= 3 ? "Take your time. Wrong guesses add a short wait." : "Enter your passcode"}
            onComplete={attempt}
            footer={
              <Button variant="link" className="text-muted-foreground" onClick={() => setForgot(true)}>
                Forgot passcode?
              </Button>
            }
          />
        </>
      )}

      <AlertDialog open={forgot} onOpenChange={setForgot}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start over on this phone?</AlertDialogTitle>
            <AlertDialogDescription>
              Your passcode is the only key to what's stored here, so it can't be reset. Starting over erases raaz
              on this phone. You'll set a new passcode and connect with them again using a new code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep trying</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void wipeDevice()}>
              Erase and start over
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}
