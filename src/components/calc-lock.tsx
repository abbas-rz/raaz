import { useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { PIN_LENGTH } from "./pin-pad"

// A working calculator. Typing the passcode and pressing = opens raaz;
// anything else just calculates.
const KEYS = [
  ["C", "fn"],
  ["÷", "op"],
  ["×", "op"],
  ["−", "op"],
  ["7", ""],
  ["8", ""],
  ["9", ""],
  ["+", "op"],
  ["4", ""],
  ["5", ""],
  ["6", ""],
  ["=", "eq"],
  ["1", ""],
  ["2", ""],
  ["3", ""],
  ["0", "zero"],
  [".", ""],
] as const

const OPS: Record<string, (a: number, b: number) => number> = {
  "+": (a, b) => a + b,
  "−": (a, b) => a - b,
  "×": (a, b) => a * b,
  "÷": (a, b) => (b === 0 ? NaN : a / b),
}

function evaluate(tokens: string[]): string {
  if (!tokens.length) return "0"
  const t = OPS[tokens[tokens.length - 1]] ? tokens.slice(0, -1) : tokens
  // × and ÷ before + and −
  const stack: (number | string)[] = [parseFloat(t[0])]
  for (let i = 1; i < t.length; i += 2) {
    const op = t[i]
    const n = parseFloat(t[i + 1])
    if (op === "×" || op === "÷") stack.push(OPS[op](stack.pop() as number, n))
    else stack.push(op, n)
  }
  let acc = stack[0] as number
  for (let i = 1; i < stack.length; i += 2) acc = OPS[stack[i] as string](acc, stack[i + 1] as number)
  return Number.isFinite(acc) ? String(+acc.toPrecision(12)) : "Error"
}

// Holding C for 3 seconds is the hidden way to "Forgot passcode?".
const HOLD_MS = 3000

export function CalcLock({ onCode, onHoldClear }: { onCode: (pin: string) => Promise<boolean>; onHoldClear?: () => void }) {
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Kept in a ref so quick taps between renders are never lost.
  const st = useRef({ tokens: [] as string[], cur: "", digits: "" })
  const [shown, setShown] = useState("0")

  async function press(k: string) {
    const s = st.current
    if (k === "C") {
      st.current = { tokens: [], cur: "", digits: "" }
      return setShown("0")
    }
    if (k === "=") {
      const candidate = s.digits
      s.digits = ""
      if (candidate.length === PIN_LENGTH && (await onCode(candidate))) return
      const out = evaluate(s.cur ? [...s.tokens, s.cur] : s.tokens)
      st.current = { tokens: out === "Error" ? [] : [out], cur: "", digits: "" }
      return setShown(out)
    }
    if (OPS[k]) {
      s.digits = ""
      const all = s.cur ? [...s.tokens, s.cur] : s.tokens
      if (!all.length) return
      s.tokens = OPS[all[all.length - 1]] ? [...all.slice(0, -1), k] : [...all, k]
      s.cur = ""
      return setShown(s.tokens.join(" "))
    }
    if (k === "." && s.cur.includes(".")) return
    if (/^\d$/.test(k)) s.digits = (s.digits + k).slice(-PIN_LENGTH)
    if (!s.cur && s.tokens.length === 1 && !OPS[s.tokens[0]]) s.tokens = []
    s.cur = (s.cur === "0" && k !== "." ? "" : s.cur) + k
    setShown(s.cur)
  }

  // Deliberately plain greys, no raaz colours or fonts: this has to pass as a
  // stock calculator to anyone glancing at the phone.
  return (
    <div className="flex size-full max-w-sm flex-col gap-4 p-5 pt-safe pb-safe font-[system-ui,sans-serif] text-[#e8eaed]">
      <div className="flex flex-1 items-end justify-end overflow-hidden px-2">
        <output className="text-6xl font-light break-all text-right tabular-nums">{shown}</output>
      </div>
      <div className="grid grid-cols-4 gap-3 no-select">
        {KEYS.map(([k, kind]) => (
          <button
            key={k}
            type="button"
            onClick={() => void press(k)}
            onPointerDown={() => {
              if (k !== "C" || !onHoldClear) return
              clearTimeout(hold.current)
              hold.current = setTimeout(onHoldClear, HOLD_MS)
            }}
            onPointerUp={() => clearTimeout(hold.current)}
            onPointerLeave={() => clearTimeout(hold.current)}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
              "h-16 rounded-full bg-[#303134] text-2xl font-normal transition-[transform,background-color] outline-none focus-visible:ring-2 focus-visible:ring-[#8ab4f8] active:scale-95 active:bg-[#3c4043]",
              kind === "fn" && "bg-[#5f6368] text-[#e8eaed]",
              kind === "op" && "bg-[#3c4043] text-[#8ab4f8]",
              kind === "eq" && "row-span-2 h-auto rounded-[2rem] bg-[#f29900] text-[#202124]",
              kind === "zero" && "col-span-2",
            )}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}
