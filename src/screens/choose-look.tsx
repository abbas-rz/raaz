import { useState } from "react"
import { Mark } from "@/components/brand"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { chooseLook } from "@/lib/engine"

const OPTIONS = [
  {
    value: "calc",
    icon: <img src="/calc-192.png" alt="" className="size-14 rounded-2xl" />,
    title: "Hide it as a calculator",
    body: "Shows up as “Calculator” with a calculator icon. It opens to a working calculator: type your passcode, then = to get in.",
    recommended: true,
  },
  {
    value: "raaz",
    icon: <Mark className="size-14" />,
    title: "Show it as raaz",
    body: "The raaz name and icon. It opens to a passcode screen.",
    recommended: false,
  },
] as const

export function ChooseLook() {
  const [look, setLook] = useState<"calc" | "raaz">("calc")
  const [busy, setBusy] = useState(false)

  return (
    <main className="flex h-full flex-col gap-6 px-6 pt-safe pb-safe">
      <div className="flex flex-1 flex-col justify-center gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl leading-none font-extrabold">How should it look on your phone?</h1>
          <p className="text-muted-foreground">You can change this later in Settings.</p>
        </div>

        <ToggleGroup
          value={[look]}
          onValueChange={(v) => v[0] && setLook(v[0] as "calc" | "raaz")}
          orientation="vertical"
          spacing={3}
          aria-label="How raaz looks"
          className="w-full"
        >
          {OPTIONS.map((o) => (
            <ToggleGroupItem
              key={o.value}
              value={o.value}
              variant="outline"
              className="h-auto w-full items-start justify-start gap-4 rounded-3xl p-4 text-left whitespace-normal data-pressed:border-primary data-pressed:bg-primary/10"
            >
              <span className="shrink-0">{o.icon}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 font-heading text-lg leading-tight font-bold">
                  {o.title}
                  {o.recommended && <Badge>Recommended</Badge>}
                </span>
                <span className="text-sm leading-snug font-normal text-muted-foreground">{o.body}</span>
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        <p className="text-sm text-muted-foreground">
          Add raaz to your home screen after this step, so the icon matches what you picked.
        </p>
      </div>

      <Button
        size="lg"
        className="h-14 w-full rounded-full text-lg font-semibold"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          await chooseLook(look)
        }}
      >
        Continue
      </Button>
    </main>
  )
}
