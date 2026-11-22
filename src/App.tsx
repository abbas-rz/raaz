import { useEffect } from "react"
import { Mark } from "@/components/brand"
import { Toaster } from "@/components/ui/sonner"
import { boot, lock, nudgeConnection, prune, useApp } from "@/lib/engine"
import { lockHeld } from "@/lib/guard"
import { savedLook } from "@/lib/look"
import { ChooseLook } from "@/screens/choose-look"
import { Chat } from "@/screens/chat/chat"
import { Lock } from "@/screens/lock"
import { Pair } from "@/screens/pair"
import { SetPin } from "@/screens/set-pin"
import { Welcome } from "@/screens/welcome"

export default function App() {
  const phase = useApp((s) => s.phase)

  useEffect(() => {
    void boot()

    // Leaving the app locks it, unless a photo picker or share sheet is open.
    const onVisibility = () => {
      if (document.hidden) {
        if (!lockHeld()) lock()
      } else {
        nudgeConnection()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("online", nudgeConnection)
    const sweep = setInterval(prune, 60_000)
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("online", nudgeConnection)
      clearInterval(sweep)
    }
  }, [])

  return (
    <div className="mx-auto h-dvh max-w-md overflow-hidden sm:my-0 sm:border-x">
      {phase === "boot" &&
        (savedLook() === "calc" ? (
          // Disguised: the first frame is already a plain calculator-coloured screen.
          <div className="fixed inset-0 bg-[#111113]" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Mark className="size-16 animate-pulse" />
          </div>
        ))}
      {phase === "welcome" && <Welcome />}
      {phase === "setpin" && <SetPin />}
      {phase === "look" && <ChooseLook />}
      {phase === "pair" && <Pair />}
      {phase === "locked" && <Lock />}
      {phase === "chat" && <Chat />}
      <Toaster position="top-center" />
    </div>
  )
}
