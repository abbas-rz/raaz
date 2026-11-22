import { unb64, b64 } from "@/core/bytes"
import { deriveRoom, inviteKeys, newKeyPair, signPub, verifyPub, type RoomSecrets, type Role } from "@/core/crypto"
import { INVITE_TTL_MS } from "@/core/protocol"

export class PairingError extends Error {
  reason: "expired" | "taken" | "tampered" | "network" | "cancelled"
  constructor(reason: PairingError["reason"]) {
    super(reason)
    this.reason = reason
  }
}

interface InviteState {
  a: { pk: string; mac: string }
  b?: { pk: string; mac: string }
}

async function api(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { ...init, headers: { "content-type": "application/json" } })
  } catch {
    throw new PairingError("network")
  }
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      clearTimeout(t)
      reject(new PairingError("cancelled"))
    })
  })

export interface Paired {
  secrets: RoomSecrets
  role: Role
}

// The person who taps "Start" runs this. It waits until someone joins with the code.
export async function hostInvite(code: string, signal: AbortSignal): Promise<Paired> {
  const { inviteId, macKey } = await inviteKeys(code)
  const me = await newKeyPair()
  const res = await api(`/api/invite/${inviteId}`, {
    method: "POST",
    body: JSON.stringify({ pk: b64(me.pub), mac: await signPub(macKey, "A", me.pub) }),
  })
  if (res.status === 409) throw new PairingError("taken")
  if (!res.ok) throw new PairingError("network")

  const deadline = Date.now() + INVITE_TTL_MS
  while (Date.now() < deadline) {
    await wait(1500, signal)
    const r = await api(`/api/invite/${inviteId}`)
    if (r.status === 404) throw new PairingError("expired")
    if (!r.ok) continue
    const state = (await r.json()) as InviteState
    if (!state.b) continue
    const peer = unb64(state.b.pk)
    // Clean up first: the invite is single use whatever happens next.
    await api(`/api/invite/${inviteId}`, { method: "DELETE" }).catch(() => {})
    if (!(await verifyPub(macKey, "B", peer, state.b.mac))) throw new PairingError("tampered")
    return { secrets: await deriveRoom(me, peer, "A"), role: "A" }
  }
  throw new PairingError("expired")
}

export async function cancelInvite(code: string) {
  const { inviteId } = await inviteKeys(code)
  await api(`/api/invite/${inviteId}`, { method: "DELETE" }).catch(() => {})
}

// The person who types the code runs this.
export async function joinInvite(code: string): Promise<Paired> {
  const { inviteId, macKey } = await inviteKeys(code)
  const r = await api(`/api/invite/${inviteId}`)
  if (r.status === 404) throw new PairingError("expired")
  if (!r.ok) throw new PairingError("network")
  const state = (await r.json()) as InviteState
  if (state.b) throw new PairingError("taken")
  const host = unb64(state.a.pk)
  if (!(await verifyPub(macKey, "A", host, state.a.mac))) throw new PairingError("tampered")

  const me = await newKeyPair()
  const j = await api(`/api/invite/${inviteId}/join`, {
    method: "POST",
    body: JSON.stringify({ pk: b64(me.pub), mac: await signPub(macKey, "B", me.pub) }),
  })
  if (j.status === 409) throw new PairingError("taken")
  if (j.status === 404) throw new PairingError("expired")
  if (!j.ok) throw new PairingError("network")
  return { secrets: await deriveRoom(me, host, "B"), role: "B" }
}
