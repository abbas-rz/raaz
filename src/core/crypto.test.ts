import { describe, expect, it } from "vitest"
import { formatCode, isValidCode, newInviteCode, normalizeCode } from "./code"
import {
  changeVaultPin,
  createVault,
  deriveRoom,
  importAesKey,
  inviteKeys,
  newKeyPair,
  openJson,
  openPayload,
  openVault,
  pad,
  sealJson,
  sealPayload,
  signPub,
  unpad,
  verifyPub,
} from "./crypto"
import { utf8 } from "./bytes"

const FAST = 1000 // keep PBKDF2 cheap in tests

async function pairBoth(codeA: string, codeB: string) {
  const ka = await inviteKeys(codeA, FAST)
  const kb = await inviteKeys(codeB, FAST)
  const a = await newKeyPair()
  const b = await newKeyPair()
  const macA = await signPub(ka.macKey, "A", a.pub)
  const macB = await signPub(kb.macKey, "B", b.pub)
  return { ka, kb, a, b, macA, macB }
}

describe("invite codes", () => {
  it("makes 8-character codes that validate", () => {
    for (let i = 0; i < 50; i++) expect(isValidCode(newInviteCode())).toBe(true)
  })
  it("forgives how people type them", () => {
    expect(normalizeCode("ab1o-il2u")).toBe("AB10112V")
    expect(formatCode("ab12cd34")).toBe("AB12-CD34")
    expect(isValidCode("AB12")).toBe(false)
  })
})

describe("pairing", () => {
  it("both sides derive the same room, keys and safety emoji", async () => {
    const { ka, kb, a, b, macA, macB } = await pairBoth("K7QXM2PA", "k7qx-m2pa")
    expect(ka.inviteId).toBe(kb.inviteId)
    expect(await verifyPub(kb.macKey, "A", a.pub, macA)).toBe(true)
    expect(await verifyPub(ka.macKey, "B", b.pub, macB)).toBe(true)

    const ra = await deriveRoom(a, b.pub, "A")
    const rb = await deriveRoom(b, a.pub, "B")
    expect(ra).toEqual(rb)
    expect(ra.roomId).toMatch(/^[0-9a-f]{32}$/)
    expect(ra.safety).toHaveLength(4)
  })

  it("rejects a key signed with a different code", async () => {
    const { kb, a } = await pairBoth("K7QXM2PA", "K7QXM2PB")
    const wrong = await inviteKeys("K7QXM2PB", FAST)
    const macA = await signPub(wrong.macKey, "A", a.pub)
    expect(await verifyPub((await inviteKeys("K7QXM2PA", FAST)).macKey, "A", a.pub, macA)).toBe(false)
    expect(kb.inviteId).not.toBe((await inviteKeys("K7QXM2PA", FAST)).inviteId)
  })

  it("rejects a key replayed in the other role", async () => {
    const { ka, a, macA } = await pairBoth("K7QXM2PA", "K7QXM2PA")
    expect(await verifyPub(ka.macKey, "B", a.pub, macA)).toBe(false)
  })
})

describe("envelopes", () => {
  it("round-trips a payload and hides its length", async () => {
    const key = await importAesKey(crypto.getRandomValues(new Uint8Array(32)))
    const short = await sealPayload(key, "room1", { k: "text", text: "hi" })
    const long = await sealPayload(key, "room1", { k: "text", text: "x".repeat(300) })
    expect(short.length).toBe(long.length)
    expect(await openPayload(key, "room1", short)).toEqual({ k: "text", text: "hi" })
  })

  it("won't open a payload moved to another room", async () => {
    const key = await importAesKey(crypto.getRandomValues(new Uint8Array(32)))
    const body = await sealPayload(key, "room1", { k: "nudge" })
    expect(await openPayload(key, "room2", body)).toBeNull()
  })

  it("pads to buckets", () => {
    expect(pad(utf8("a")).length).toBe(512)
    expect(pad(new Uint8Array(600)).length).toBe(2048)
    expect(pad(new Uint8Array(200_000)).length).toBe(262144)
    expect(unpad(pad(utf8("hello")))).toEqual(utf8("hello"))
  })
})

describe("vault", () => {
  it("opens with the right passcode only", async () => {
    const { record, key } = await createVault("123456", FAST)
    const secret = await sealJson(key, { a: 1 })
    expect(await openVault("000000", record)).toBeNull()
    const again = await openVault("123456", record)
    expect(again).not.toBeNull()
    expect(await openJson(again!, secret)).toEqual({ a: 1 })
  })

  it("changes the passcode without losing data", async () => {
    const { record, key } = await createVault("123456", FAST)
    const secret = await sealJson(key, "kept")
    const next = await changeVaultPin("123456", "654321", record)
    expect(next).not.toBeNull()
    expect(await openVault("123456", next!)).toBeNull()
    expect(await openJson(await openVault("654321", next!).then((k) => k!), secret)).toBe("kept")
  })
})
