// Two simulated phones against a running raaz server (npm run dev).
// Run: RAAZ_URL=http://127.0.0.1:5173 npx vitest run e2e
import { afterAll, describe, expect, it } from "vitest"
import { b64, randomId, unb64 } from "../src/core/bytes"
import { formatCode, newInviteCode } from "../src/core/code"
import {
  deriveRoom,
  importAesKey,
  inviteKeys,
  newKeyPair,
  openPayload,
  sealPayload,
  signPub,
  verifyPub,
  type RoomSecrets,
} from "../src/core/crypto"
import type { C2S, Payload, S2C } from "../src/core/protocol"

const BASE = process.env.RAAZ_URL
const WS = BASE?.replace(/^http/, "ws")

class Phone {
  device = randomId()
  ws: WebSocket | null = null
  inbox: S2C[] = []
  waiters: (() => void)[] = []
  constructor(public secrets: RoomSecrets) {}

  async connect(auth = this.secrets.auth) {
    const ws = new WebSocket(`${WS}/api/room/${this.secrets.roomId}`)
    this.ws = ws
    ws.onmessage = (e) => {
      this.inbox.push(JSON.parse(String(e.data)) as S2C)
      this.waiters.splice(0).forEach((w) => w())
    }
    await new Promise<void>((r, j) => {
      ws.onopen = () => r()
      ws.onerror = () => j(new Error("ws failed"))
    })
    this.send({ t: "hello", auth, device: this.device })
    return this.next("ready")
  }

  send(m: C2S) {
    this.ws!.send(JSON.stringify(m))
  }

  async next<T extends S2C["t"]>(t: T, ms = 5000): Promise<Extract<S2C, { t: T }>> {
    const end = Date.now() + ms
    for (;;) {
      const i = this.inbox.findIndex((m) => m.t === t)
      if (i >= 0) return this.inbox.splice(i, 1)[0] as Extract<S2C, { t: T }>
      if (Date.now() > end) throw new Error(`timed out waiting for ${t}; have ${JSON.stringify(this.inbox.map((m) => m.t))}`)
      await new Promise<void>((r) => {
        this.waiters.push(r)
        setTimeout(r, 200)
      })
    }
  }

  async sendPayload(p: Payload) {
    const key = await importAesKey(this.secrets.msgKey)
    this.send({ t: "send", cid: p.id, body: await sealPayload(key, this.secrets.roomId, p) })
    return this.next("sent")
  }

  async read(m: Extract<S2C, { t: "msg" }>) {
    const key = await importAesKey(this.secrets.msgKey)
    return openPayload<Payload>(key, this.secrets.roomId, m.body)
  }

  close() {
    this.ws?.close()
    this.ws = null
  }
}

async function pairOverServer(code: string) {
  const host = await inviteKeys(code)
  const a = await newKeyPair()
  const post = await fetch(`${BASE}/api/invite/${host.inviteId}`, {
    method: "POST",
    body: JSON.stringify({ pk: b64(a.pub), mac: await signPub(host.macKey, "A", a.pub) }),
  })
  expect(post.status).toBe(200)

  // The other phone types the code with a dash and in lowercase.
  const guest = await inviteKeys(formatCode(code).toLowerCase())
  const state = (await (await fetch(`${BASE}/api/invite/${guest.inviteId}`)).json()) as {
    a: { pk: string; mac: string }
  }
  expect(await verifyPub(guest.macKey, "A", unb64(state.a.pk), state.a.mac)).toBe(true)
  const b = await newKeyPair()
  const join = await fetch(`${BASE}/api/invite/${guest.inviteId}/join`, {
    method: "POST",
    body: JSON.stringify({ pk: b64(b.pub), mac: await signPub(guest.macKey, "B", b.pub) }),
  })
  expect(join.status).toBe(200)

  const after = (await (await fetch(`${BASE}/api/invite/${host.inviteId}`)).json()) as {
    b: { pk: string; mac: string }
  }
  expect(await verifyPub(host.macKey, "B", unb64(after.b.pk), after.b.mac)).toBe(true)
  await fetch(`${BASE}/api/invite/${host.inviteId}`, { method: "DELETE" })

  return {
    A: await deriveRoom(a, unb64(after.b.pk), "A"),
    B: await deriveRoom(b, unb64(state.a.pk), "B"),
    inviteId: host.inviteId,
  }
}

describe.skipIf(!BASE)("two phones over a real server", () => {
  const phones: Phone[] = []
  afterAll(() => phones.forEach((p) => p.close()))

  it("pairs, chats live, delivers offline, and forgets acknowledged messages", async () => {
    const { A, B, inviteId } = await pairOverServer(newInviteCode())
    expect(A).toEqual(B)

    // The invite is gone after use.
    expect((await fetch(`${BASE}/api/invite/${inviteId}`)).status).toBe(404)

    const a = new Phone(A)
    const b = new Phone(B)
    phones.push(a, b)
    expect((await a.connect()).peerOnline).toBe(false)
    expect((await b.connect()).peerOnline).toBe(true)
    await a.next("presence")

    // Live message A -> B, with delivery receipt.
    await a.sendPayload({ k: "text", id: "m1", ts: Date.now(), text: "kya kar rahe ho? 👀" })
    const live = await b.next("msg")
    expect(await b.read(live)).toMatchObject({ k: "text", text: "kya kar rahe ho? 👀" })
    b.send({ t: "ack", seqs: [live.seq] })
    expect((await a.next("delivered")).cids).toEqual(["m1"])

    // B goes offline; A sends two things; B comes back and gets both, in order.
    b.close()
    await a.next("presence")
    await a.sendPayload({ k: "text", id: "m2", ts: Date.now(), text: "offline 1" })
    await a.sendPayload({ k: "nudge", id: "m3", ts: Date.now() })
    const b2 = new Phone(B)
    b2.device = b.device
    phones.push(b2)
    await b2.connect()
    const first = await b2.next("msg")
    const second = await b2.next("msg")
    expect((await b2.read(first))?.k).toBe("text")
    expect((await b2.read(second))?.k).toBe("nudge")
    b2.send({ t: "ack", seqs: [first.seq, second.seq] })
    expect((await a.next("delivered")).cids).toEqual(["m2", "m3"])

    // Acknowledged messages are gone: reconnecting brings nothing back.
    b2.close()
    const b3 = new Phone(B)
    b3.device = b.device
    phones.push(b3)
    await b3.connect()
    await new Promise((r) => setTimeout(r, 400))
    expect(b3.inbox.filter((m) => m.t === "msg")).toHaveLength(0)
  })

  it("refuses a wrong auth and a third device", async () => {
    const { A } = await pairOverServer(newInviteCode())
    const a = new Phone(A)
    const b = new Phone(A)
    phones.push(a, b)
    await a.connect()
    await b.connect()

    const intruder = new Phone(A)
    phones.push(intruder)
    await expect(intruder.connect()).rejects.toThrow(/ready/)
    expect(intruder.inbox.some((m) => m.t === "error" && m.code === "full")).toBe(true)

    const forger = new Phone({ ...A, auth: b64(new Uint8Array(32)) })
    phones.push(forger)
    await expect(forger.connect()).rejects.toThrow(/ready/)
    expect(forger.inbox.some((m) => m.t === "error" && m.code === "auth")).toBe(true)
  })

  it("rejects a reused invite and lets either phone end it", async () => {
    const code = newInviteCode()
    const { A, inviteId } = await pairOverServer(code)
    const keys = await inviteKeys(code)
    expect(keys.inviteId).toBe(inviteId)
    const late = await fetch(`${BASE}/api/invite/${inviteId}/join`, {
      method: "POST",
      body: JSON.stringify({ pk: "x", mac: "y" }),
    })
    expect(late.status).toBe(404)

    const a = new Phone(A)
    const b = new Phone(A)
    phones.push(a, b)
    await a.connect()
    await b.connect()
    a.send({ t: "end" })
    await b.next("ended")
  })

  it("replaces an older tab from the same phone with close code 4000", async () => {
    const { A } = await pairOverServer(newInviteCode())
    const tab1 = new Phone(A)
    const tab2 = new Phone(A)
    tab2.device = tab1.device
    phones.push(tab1, tab2)
    await tab1.connect()
    const closed = new Promise<number>((r) => tab1.ws!.addEventListener("close", (e) => r(e.code)))
    await tab2.connect()
    expect(await closed).toBe(4000)
  })

  it("serves the push key", async () => {
    const r = (await (await fetch(`${BASE}/api/vapid`)).json()) as { key: string }
    expect(r.key).toMatch(/^B[A-Za-z0-9_-]{80,}$/)
  })
})
