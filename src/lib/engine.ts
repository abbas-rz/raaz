import { create } from "zustand"
import { randomId } from "@/core/bytes"
import {
  changeVaultPin,
  createVault,
  importAesKey,
  openJson,
  openPayload,
  openVault,
  sealJson,
  sealPayload,
  type RoomSecrets,
} from "@/core/crypto"
import { MAX_BODY, type C2S, type Payload, type S2C } from "@/core/protocol"
import { clearRoomData, db, DEFAULT_PREFS, getMeta, setMeta, wipeAll, type Prefs, type RoomRef } from "./db"

// ---------------------------------------------------------------------------
// Types the UI renders
// ---------------------------------------------------------------------------

export type Phase = "boot" | "welcome" | "setpin" | "pair" | "locked" | "chat"

export interface ChatMsg {
  id: string
  ts: number
  from: "me" | "them"
  k: "text" | "snap" | "nudge" | "locreq" | "loc" | "locno" | "system"
  text?: string
  snap?: { mime: string; data?: string; secs: number | null; caption?: string; openedAt?: number }
  loc?: { lat: number; lon: number; acc: number }
  react?: { me?: string; them?: string }
  status?: "queued" | "sent" | "delivered"
  ord?: number // arrival order, breaks ties between messages sent in the same millisecond
}

let ordCounter = 0
const byTime = (a: ChatMsg, b: ChatMsg) => a.ts - b.ts || (a.ord ?? 0) - (b.ord ?? 0)

interface Secure {
  msgKey: string
  safety: string[]
  partnerName: string
  pairedAt: number
  timerHours: number
}

interface State {
  phase: Phase
  prefs: Prefs
  messages: ChatMsg[]
  partnerName: string
  safety: string[]
  timerHours: number
  connected: boolean
  peerOnline: boolean
  peerTyping: boolean
  burst: number // bumps when a nudge arrives, drives the heart animation
  notice: string | null // one-off banner, e.g. "They ended your raaz"
}

export const useApp = create<State>(() => ({
  phase: "boot",
  prefs: DEFAULT_PREFS,
  messages: [],
  partnerName: "",
  safety: [],
  timerHours: 24,
  connected: false,
  peerOnline: false,
  peerTyping: false,
  burst: 0,
  notice: null,
}))

const set = useApp.setState
const get = useApp.getState

// ---------------------------------------------------------------------------
// Secrets held in memory only while unlocked
// ---------------------------------------------------------------------------

let deviceId = ""
let vaultKey: CryptoKey | null = null
let msgKey: CryptoKey | null = null
let room: RoomRef | null = null
let secure: Secure | null = null

// Serialises anything that reads-modifies-writes storage.
let chain: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn)
  chain = p.catch(() => {})
  return p
}

// ---------------------------------------------------------------------------
// Boot, passcode, lock
// ---------------------------------------------------------------------------

export async function boot() {
  let device = await getMeta("device")
  if (!device) {
    device = randomId()
    await setMeta("device", device)
  }
  deviceId = device
  const prefs = { ...DEFAULT_PREFS, ...((await getMeta("prefs")) ?? {}) }
  room = (await getMeta("room")) ?? null
  const vault = await getMeta("vault")
  set({ prefs, phase: vault ? "locked" : "welcome" })
  if (room) connect()
}

export function startSetup() {
  set({ phase: "setpin" })
}

export async function createPin(pin: string) {
  const { record, key } = await createVault(pin)
  await setMeta("vault", record)
  vaultKey = key
  set({ phase: "pair" })
}

export async function unlock(pin: string): Promise<boolean> {
  const record = await getMeta("vault")
  if (!record) return false
  const key = await openVault(pin, record)
  if (!key) return false
  vaultKey = key
  room = (await getMeta("room")) ?? null
  const sealed = room ? await (await db()).get("secure", "room") : undefined
  secure = sealed ? await openJson<Secure>(key, sealed) : null

  if (!room || !secure) {
    set({ phase: "pair" })
    return true
  }
  msgKey = await importAesKey(secure.msgKey)
  await loadMessages()
  set({
    phase: "chat",
    partnerName: secure.partnerName,
    safety: secure.safety,
    timerHours: secure.timerHours,
  })
  await processInbox()
  prune()
  connect()
  return true
}

export async function changePin(oldPin: string, newPin: string): Promise<boolean> {
  const record = await getMeta("vault")
  if (!record) return false
  const next = await changeVaultPin(oldPin, newPin, record)
  if (!next) return false
  await setMeta("vault", next)
  return true
}

export function lock() {
  if (get().phase !== "chat" && get().phase !== "pair") return
  vaultKey = null
  msgKey = null
  secure = null
  set({ phase: "locked", messages: [], partnerName: "", safety: [] })
}

// Forgot passcode: the only way out is a clean slate.
export async function wipeDevice() {
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
  vaultKey = msgKey = null
  room = secure = null
  await wipeAll()
  location.reload()
}

// ---------------------------------------------------------------------------
// Pairing result
// ---------------------------------------------------------------------------

export async function completePairing(secrets: RoomSecrets, partnerName: string) {
  if (!vaultKey) throw new Error("locked")
  await clearRoomData()
  room = { roomId: secrets.roomId, auth: secrets.auth }
  secure = {
    msgKey: secrets.msgKey,
    safety: secrets.safety,
    partnerName: partnerName.trim() || "Them",
    pairedAt: Date.now(),
    timerHours: 24,
  }
  await setMeta("room", room)
  await saveSecure()
  msgKey = await importAesKey(secrets.msgKey)
  set({
    phase: "chat",
    messages: [],
    partnerName: secure.partnerName,
    safety: secure.safety,
    timerHours: secure.timerHours,
    notice: null,
  })
  disconnect()
  connect()
  if (get().prefs.push) void enablePush().catch(() => {})
}

async function saveSecure() {
  if (!vaultKey || !secure) return
  await (await db()).put("secure", await sealJson(vaultKey, secure), "room")
}

export async function setPartnerName(name: string) {
  if (!secure) return
  secure.partnerName = name.trim() || "Them"
  await saveSecure()
  set({ partnerName: secure.partnerName })
}

// ---------------------------------------------------------------------------
// Messages at rest
// ---------------------------------------------------------------------------

async function loadMessages() {
  if (!vaultKey) return
  const rows = await (await db()).getAll("msgs")
  const list: ChatMsg[] = []
  for (const r of rows) {
    const m = await openJson<ChatMsg>(vaultKey, r.blob)
    if (m) list.push(m)
  }
  ordCounter = Math.max(0, ...list.map((m) => m.ord ?? 0))
  list.sort(byTime)
  set({ messages: list })
}

async function saveMsg(m: ChatMsg) {
  if (!vaultKey) return
  await (await db()).put("msgs", { id: m.id, blob: await sealJson(vaultKey, m) })
}

function upsert(m: ChatMsg) {
  const prev = get().messages.find((x) => x.id === m.id)
  m = { ...m, ord: prev?.ord ?? m.ord ?? ++ordCounter }
  const list = get().messages.filter((x) => x.id !== m.id)
  list.push(m)
  list.sort(byTime)
  set({ messages: list })
  return saveMsg(m)
}

async function patch(id: string, fn: (m: ChatMsg) => ChatMsg) {
  const m = get().messages.find((x) => x.id === id)
  if (m) await upsert(fn(m))
}

async function wipeMessages() {
  await (await db()).clear("msgs")
  set({ messages: [] })
}

function system(text: string, ts = Date.now()): ChatMsg {
  return { id: randomId(), ts, from: "them", k: "system", text }
}

// Disappearing messages. Unopened snaps wait for their viewer.
export function prune() {
  const hours = get().timerHours
  if (!hours || !vaultKey) return
  const cutoff = Date.now() - hours * 3600 * 1000
  const doomed = get().messages.filter(
    (m) => m.ts < cutoff && !(m.k === "snap" && m.from === "them" && !m.snap?.openedAt && m.snap?.data),
  )
  if (!doomed.length) return
  const ids = new Set(doomed.map((m) => m.id))
  set({ messages: get().messages.filter((m) => !ids.has(m.id)) })
  void db().then(async (d) => {
    for (const id of ids) await d.delete("msgs", id)
  })
}

// ---------------------------------------------------------------------------
// Applying payloads (from either side)
// ---------------------------------------------------------------------------

function timerLabel(hours: number) {
  if (!hours) return "Messages now stay until you clear them"
  if (hours === 24) return "Messages now disappear after 24 hours"
  return `Messages now disappear after ${hours / 24} days`
}

async function apply(p: Payload, from: "me" | "them") {
  const base = { id: p.id, ts: p.ts, from } as const
  switch (p.k) {
    case "text":
      return upsert({ ...base, k: "text", text: p.text, status: from === "me" ? "queued" : undefined })
    case "snap": {
      // The sender can't rewatch a view-once snap, just like the receiver after opening it.
      const keep = p.secs === null || from === "them"
      return upsert({
        ...base,
        k: "snap",
        snap: { mime: p.mime, data: keep ? p.data : undefined, secs: p.secs, caption: p.caption },
        status: from === "me" ? "queued" : undefined,
      })
    }
    case "opened":
      return patch(p.ref, (m) => (m.snap ? { ...m, snap: { ...m.snap, openedAt: p.ts } } : m))
    case "react":
      return patch(p.ref, (m) => ({
        ...m,
        react: { ...m.react, [from]: p.emoji ?? undefined },
      }))
    case "nudge":
      if (from === "them") set({ burst: get().burst + 1 })
      return upsert({ ...base, k: "nudge", status: from === "me" ? "queued" : undefined })
    case "locreq":
    case "locno":
      return upsert({ ...base, k: p.k, status: from === "me" ? "queued" : undefined })
    case "loc":
      return upsert({
        ...base,
        k: "loc",
        loc: { lat: p.lat, lon: p.lon, acc: p.acc },
        status: from === "me" ? "queued" : undefined,
      })
    case "timer":
      if (secure) {
        secure.timerHours = p.hours
        await saveSecure()
      }
      set({ timerHours: p.hours })
      return upsert({ ...system(timerLabel(p.hours), p.ts), id: p.id })
    case "clear":
      await wipeMessages()
      return upsert({ ...system(from === "me" ? "You cleared the chat" : "They cleared the chat", p.ts), id: p.id })
  }
}

async function processInbox() {
  return serial(async () => {
    if (!msgKey || !room) return
    const d = await db()
    const items = await d.getAll("inbox")
    for (const item of items.sort((a, b) => a.seq - b.seq)) {
      const p = await openPayload<Payload>(msgKey, room.roomId, item.body)
      if (p) await apply(p, "them")
      await d.delete("inbox", item.seq)
    }
  })
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

type Draft = Payload extends infer P ? (P extends Payload ? Omit<P, "id" | "ts"> : never) : never

export class TooBigError extends Error {}

export async function send(draft: Draft) {
  if (!msgKey || !room) throw new Error("locked")
  const p = { ...draft, id: randomId(), ts: Date.now() } as Payload
  const body = await sealPayload(msgKey, room.roomId, p)
  if (body.length > MAX_BODY) throw new TooBigError()
  await (await db()).put("outbox", { cid: p.id, body, ts: p.ts })
  await apply(p, "me")
  transmit({ t: "send", cid: p.id, body })
  return p
}

export const sendText = (text: string) => send({ k: "text", text })
export const sendNudge = () => send({ k: "nudge" })
export const askLocation = () => send({ k: "locreq" })
export const declineLocation = () => send({ k: "locno" })
export const shareLocation = (lat: number, lon: number, acc: number) => send({ k: "loc", lat, lon, acc })
export const setTimer = (hours: number) => send({ k: "timer", hours })
export const clearForBoth = () => send({ k: "clear" })

export function sendSnap(data: string, mime: string, secs: number | null, caption?: string) {
  return send({ k: "snap", data, mime, secs, caption: caption?.trim() || undefined })
}

export async function react(ref: string, emoji: string | null) {
  await send({ k: "react", ref, emoji })
}

// Called when the snap viewer closes. Drops the photo for good.
export async function finishSnap(id: string) {
  const m = get().messages.find((x) => x.id === id)
  if (!m?.snap || m.from !== "them") return
  if (m.snap.secs === null) return
  await upsert({ ...m, snap: { ...m.snap, data: undefined, openedAt: Date.now() } })
  await send({ k: "opened", ref: id })
}

export async function clearMine() {
  await wipeMessages()
}

// ---------------------------------------------------------------------------
// Connection to the mailbox
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null
let retry = 0
let retryTimer: ReturnType<typeof setTimeout> | undefined
let pingTimer: ReturnType<typeof setInterval> | undefined
let typingTimer: ReturnType<typeof setTimeout> | undefined
let stopped = false

function transmit(msg: C2S) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function disconnect() {
  clearTimeout(retryTimer)
  clearInterval(pingTimer)
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
  set({ connected: false, peerOnline: false })
}

export function connect() {
  if (!room || ws) return
  stopped = false
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/room/${room.roomId}`
  const sock = new WebSocket(url)
  ws = sock
  sock.onopen = () => {
    if (!room) return
    retry = 0
    sock.send(JSON.stringify({ t: "hello", auth: room.auth, device: deviceId } satisfies C2S))
    clearInterval(pingTimer)
    pingTimer = setInterval(() => sock.readyState === WebSocket.OPEN && sock.send('{"t":"ping"}'), 25_000)
  }
  sock.onmessage = (e) => {
    try {
      void onServer(JSON.parse(String(e.data)) as S2C)
    } catch {
      /* ignore junk */
    }
  }
  sock.onclose = (e) => {
    clearInterval(pingTimer)
    ws = null
    set({ connected: false, peerOnline: false })
    if (stopped) return
    // 4000: another tab of raaz on this phone took over. Don't fight it; this
    // tab reconnects when it's opened again (see nudgeConnection).
    // 4001-4003: wrong password, mailbox full, or ended. Retrying can't help.
    if (e.code >= 4000 && e.code <= 4003) return
    retry = Math.min(retry + 1, 6)
    retryTimer = setTimeout(connect, 500 * 2 ** retry)
  }
}

// Reconnect straight away when the phone comes back online or the app reopens.
export function nudgeConnection() {
  if (!room) return
  if (!ws) {
    clearTimeout(retryTimer)
    retry = 0
    connect()
  }
}

async function onServer(m: S2C) {
  switch (m.t) {
    case "ready": {
      set({ connected: true, peerOnline: m.peerOnline })
      const out = await (await db()).getAll("outbox")
      for (const o of out.sort((a, b) => a.ts - b.ts)) transmit({ t: "send", cid: o.cid, body: o.body })
      const sub = await currentSubscription()
      if (sub && get().prefs.push) transmit({ t: "sub", sub })
      return
    }
    case "msg":
      // Keep it on the phone first, then let the server forget it.
      await (await db()).put("inbox", { seq: m.seq, body: m.body })
      transmit({ t: "ack", seqs: [m.seq] })
      if (msgKey) await processInbox()
      return
    case "sent":
      await (await db()).delete("outbox", m.cid)
      if (vaultKey) await patch(m.cid, (x) => (x.status === "queued" ? { ...x, status: "sent" } : x))
      return
    case "delivered":
      if (vaultKey) for (const cid of m.cids) await patch(cid, (x) => ({ ...x, status: "delivered" }))
      return
    case "presence":
      set({ peerOnline: m.online, peerTyping: false })
      return
    case "typing":
      set({ peerTyping: true })
      clearTimeout(typingTimer)
      typingTimer = setTimeout(() => set({ peerTyping: false }), 3500)
      return
    case "ended":
      stopped = true
      await clearRoomData()
      room = null
      secure = null
      msgKey = null
      disconnect()
      set({
        messages: [],
        partnerName: "",
        notice: "Your raaz was ended. Everything from it is gone from this phone.",
        phase: get().phase === "chat" ? "pair" : get().phase,
      })
      return
    case "error":
      if (m.code === "auth" || m.code === "full") {
        stopped = true
        set({ notice: "This phone can't reach your shared space anymore. Pair again to keep talking." })
      }
      if (m.code === "too_big") set({ notice: "That was too big to send. Try a smaller photo." })
      return
  }
}

let lastTyping = 0
export function typing() {
  if (Date.now() - lastTyping < 2500) return
  lastTyping = Date.now()
  transmit({ t: "typing" })
}

// Ends it for both phones: the server forgets the mailbox, both phones wipe.
export async function endRaaz() {
  transmit({ t: "end" })
  stopped = true
  await clearRoomData()
  room = null
  secure = null
  msgKey = null
  disconnect()
  set({ messages: [], partnerName: "", phase: "pair" })
}

export function dismissNotice() {
  set({ notice: null })
}

// ---------------------------------------------------------------------------
// Preferences and push
// ---------------------------------------------------------------------------

export async function setPrefs(p: Partial<Prefs>) {
  const prefs = { ...get().prefs, ...p }
  await setMeta("prefs", prefs)
  set({ prefs })
}

function urlB64(s: string) {
  const t = s.replace(/-/g, "+").replace(/_/g, "/")
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager?.getSubscription()
  return sub ? (sub.toJSON() as { endpoint: string; keys?: Record<string, string> }) : null
}

export type PushResult = "on" | "denied" | "unsupported"

export async function enablePush(): Promise<PushResult> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported"
  }
  const permission = await Notification.requestPermission()
  if (permission !== "granted") return "denied"
  const reg = await navigator.serviceWorker.ready
  const { key } = (await (await fetch("/api/vapid")).json()) as { key: string }
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) }))
  transmit({ t: "sub", sub: sub.toJSON() as { endpoint: string } })
  await setPrefs({ push: true })
  return "on"
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = await reg?.pushManager?.getSubscription()
  await sub?.unsubscribe()
  transmit({ t: "sub", sub: null })
  await setPrefs({ push: false })
}
