import { useState } from "react"
import { toast } from "sonner"
import { PinPad } from "@/components/pin-pad"
import { createPin } from "@/lib/engine"

export function SetPin() {
  const [first, setFirst] = useState<string | null>(null)

  return (
    <main className="flex h-full flex-col items-center justify-center px-6 pt-safe pb-safe">
      {first === null ? (
        <PinPad
          key="first"
          title="Pick a 6-digit passcode"
          hint="It locks raaz on this phone. Don't use your phone's unlock code."
          onComplete={(pin) => {
            if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) {
              toast.error("Too easy to guess. Try something less obvious.")
              return false
            }
            setFirst(pin)
          }}
        />
      ) : (
        <PinPad
          key="confirm"
          title="Type it once more"
          hint="If you forget it, the only fix is to wipe raaz on this phone."
          onComplete={async (pin) => {
            if (pin !== first) {
              toast.error("Those didn't match. Start again.")
              setFirst(null)
              return false
            }
            await createPin(pin)
          }}
        />
      )}
    </main>
  )
}
