// A scripted "other phone" for trying the app alone in a browser.
// 1. In the browser, tap "Make a code".
// 2. RAAZ_URL=http://127.0.0.1:5173 PARTNER_CODE=ABCD1234 npx vitest run e2e/partner
// It joins, prints the safety emoji, sends a few things, then echoes for a while.
import { describe, it } from "vitest"
import { b64, randomId, unb64 } from "../src/core/bytes"
import { deriveRoom, importAesKey, inviteKeys, newKeyPair, openPayload, sealPayload, signPub, verifyPub } from "../src/core/crypto"
import type { Payload, S2C } from "../src/core/protocol"

const BASE = process.env.RAAZ_URL
const CODE = process.env.PARTNER_CODE
const STAY_MS = Number(process.env.PARTNER_STAY_MS ?? 60_000)

// A tiny 2x2 JPEG so the snap path can be exercised without a camera.
const JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="

describe.skipIf(!BASE || !CODE)("scripted partner", () => {
  it("joins and chats", { timeout: STAY_MS + 30_000 }, async () => {
    const { inviteId, macKey } = await inviteKeys(CODE!)
    const st = (await (await fetch(`${BASE}/api/invite/${inviteId}`)).json()) as { a: { pk: string; mac: string } }
    const host = unb64(st.a.pk)
    if (!(await verifyPub(macKey, "A", host, st.a.mac))) throw new Error("bad host mac")
    const me = await newKeyPair()
    await fetch(`${BASE}/api/invite/${inviteId}/join`, {
      method: "POST",
      body: JSON.stringify({ pk: b64(me.pub), mac: await signPub(macKey, "B", me.pub) }),
    })
    const room = await deriveRoom(me, host, "B")
    console.log("SAFETY", room.safety.join(" "))
    const key = await importAesKey(room.msgKey)

    const ws = new WebSocket(`${BASE!.replace(/^http/, "ws")}/api/room/${room.roomId}`)
    await new Promise((r) => (ws.onopen = r))
    const sendP = async (p: Omit<Payload, "id" | "ts">) => {
      const full = { ...p, id: randomId(), ts: Date.now() } as Payload
      ws.send(JSON.stringify({ t: "send", cid: full.id, body: await sealPayload(key, room.roomId, full) }))
    }
    ws.onmessage = async (e) => {
      const m = JSON.parse(String(e.data)) as S2C
      if (m.t !== "msg") return console.log("server:", m.t)
      ws.send(JSON.stringify({ t: "ack", seqs: [m.seq] }))
      const p = await openPayload<Payload>(key, room.roomId, m.body)
      console.log("got:", p?.k, p?.k === "text" ? p.text : "")
      if (p?.k === "text") await sendP({ k: "text", text: `echo: ${p.text}` })
      if (p?.k === "locreq") await sendP({ k: "loc", lat: 28.5459, lon: 77.1926, acc: 18 })
    }
    ws.send(JSON.stringify({ t: "hello", auth: room.auth, device: randomId() }))
    await new Promise((r) => setTimeout(r, 600))
    await sendP({ k: "text", text: "heyy 👋 finally on raaz" })
    await sendP({ k: "text", text: "canteen at 5? 🍟" })
    await sendP({ k: "snap", mime: "image/jpeg", data: JPEG, secs: 5, caption: "guess where" })
    await sendP({ k: "nudge" })
    await sendP({ k: "locreq" })
    await new Promise((r) => setTimeout(r, STAY_MS))
    ws.close()
  })
})
