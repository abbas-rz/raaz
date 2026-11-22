import { b64, concat, hex, randomBytes, sha256, unb64, utf8, td, type Bytes } from "./bytes"
import { normalizeCode } from "./code"
import { SAFETY_EMOJI } from "./emoji"

const subtle = crypto.subtle

// ---------------------------------------------------------------------------
// Pairing
//
// The invite code is stretched with PBKDF2 into two things:
//   inviteId  - where the two phones meet on the server
//   macKey    - proves each public key came from someone who knows the code
// The server sees only inviteId and the public keys. It can't forge a key
// without guessing the code, and every guess costs a full PBKDF2 run.
// ---------------------------------------------------------------------------

export const INVITE_ITERATIONS = 200_000

export interface InviteKeys {
  inviteId: string
  macKey: CryptoKey
}

export async function inviteKeys(code: string, iterations = INVITE_ITERATIONS): Promise<InviteKeys> {
  const base = await subtle.importKey("raw", utf8(normalizeCode(code)), "PBKDF2", false, ["deriveBits"])
  const bits = new Uint8Array(
    await subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: utf8("raaz/invite/v1"), iterations },
      base,
      512,
    ),
  )
  const macKey = await subtle.importKey("raw", bits.slice(32), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ])
  return { inviteId: hex(bits.slice(0, 16)), macKey }
}

export type Role = "A" | "B" // A created the invite, B joined it

export interface KeyPair {
  priv: CryptoKey
  pub: Bytes
}

export async function newKeyPair(): Promise<KeyPair> {
  const kp = (await subtle.generateKey({ name: "X25519" }, false, ["deriveBits"])) as CryptoKeyPair
  return { priv: kp.privateKey, pub: new Uint8Array(await subtle.exportKey("raw", kp.publicKey)) }
}

export async function signPub(macKey: CryptoKey, role: Role, pub: Bytes): Promise<string> {
  return b64(new Uint8Array(await subtle.sign("HMAC", macKey, concat(utf8(role), pub))))
}

export async function verifyPub(macKey: CryptoKey, role: Role, pub: Bytes, mac: string): Promise<boolean> {
  try {
    return await subtle.verify("HMAC", macKey, unb64(mac), concat(utf8(role), pub))
  } catch {
    return false
  }
}

export interface RoomSecrets {
  roomId: string // mailbox name on the server
  auth: string // proves to the server that we belong in the mailbox
  msgKey: string // base64 AES-256 key for messages, kept inside the vault
  safety: string[] // four emoji both phones should show
}

export async function deriveRoom(me: KeyPair, peerPub: Bytes, role: Role): Promise<RoomSecrets> {
  const peer = await subtle.importKey("raw", peerPub, { name: "X25519" }, false, [])
  const shared = await subtle.deriveBits({ name: "X25519", public: peer }, me.priv, 256)
  const ikm = await subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"])
  const [pkA, pkB] = role === "A" ? [me.pub, peerPub] : [peerPub, me.pub]
  const salt = await sha256(concat(pkA, pkB))
  const take = async (info: string, bytes: number) =>
    new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: utf8(info) }, ikm, bytes * 8))

  const safetyBytes = await take("raaz/v1/safety", 4)
  return {
    roomId: hex(await take("raaz/v1/room", 16)),
    auth: b64(await take("raaz/v1/auth", 32)),
    msgKey: b64(await take("raaz/v1/msg", 32)),
    safety: Array.from(safetyBytes, (b) => SAFETY_EMOJI[b % SAFETY_EMOJI.length]),
  }
}

// ---------------------------------------------------------------------------
// Message envelopes: AES-256-GCM with a random IV, padded to a few fixed sizes
// so the server can't tell a "hi" from a paragraph.
// ---------------------------------------------------------------------------

const BUCKETS = [512, 2048, 8192, 32768, 131072]
const BIG = 131072

export function pad(data: Uint8Array): Bytes {
  const need = data.length + 4
  const size = BUCKETS.find((b) => b >= need) ?? Math.ceil(need / BIG) * BIG
  const out = new Uint8Array(size)
  new DataView(out.buffer).setUint32(0, data.length)
  out.set(data, 4)
  return out
}

export function unpad(p: Uint8Array): Bytes {
  const len = new DataView(p.buffer, p.byteOffset, p.byteLength).getUint32(0)
  if (len > p.length - 4) throw new Error("bad padding")
  return p.slice(4, 4 + len)
}

export async function importAesKey(raw: string | Bytes): Promise<CryptoKey> {
  const bytes = typeof raw === "string" ? unb64(raw) : raw
  return subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

export async function sealBytes(key: CryptoKey, data: Bytes, aad?: Bytes): Promise<string> {
  const iv = randomBytes(12)
  const ct = new Uint8Array(
    await subtle.encrypt(aad ? { name: "AES-GCM", iv, additionalData: aad } : { name: "AES-GCM", iv }, key, data),
  )
  return b64(concat(iv, ct))
}

export async function openBytes(key: CryptoKey, body: string, aad?: Bytes): Promise<Bytes | null> {
  try {
    const all = unb64(body)
    const iv = all.slice(0, 12)
    const pt = await subtle.decrypt(
      aad ? { name: "AES-GCM", iv, additionalData: aad } : { name: "AES-GCM", iv },
      key,
      all.slice(12),
    )
    return new Uint8Array(pt)
  } catch {
    return null
  }
}

export async function sealPayload(key: CryptoKey, roomId: string, payload: unknown): Promise<string> {
  return sealBytes(key, pad(utf8(JSON.stringify(payload))), utf8(roomId))
}

export async function openPayload<T>(key: CryptoKey, roomId: string, body: string): Promise<T | null> {
  const pt = await openBytes(key, body, utf8(roomId))
  if (!pt) return null
  try {
    return JSON.parse(td.decode(unpad(pt))) as T
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Vault: everything private on the phone is encrypted with a random vault key.
// The vault key itself is wrapped with a key stretched from the passcode, so
// the passcode really protects the data, not just the screen.
// ---------------------------------------------------------------------------

export const VAULT_ITERATIONS = 310_000

export interface VaultRecord {
  salt: string
  iterations: number
  wrapped: string
}

async function passKey(pin: string, salt: Bytes, iterations: number): Promise<CryptoKey> {
  const base = await subtle.importKey("raw", utf8(pin), "PBKDF2", false, ["deriveKey"])
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

export async function createVault(
  pin: string,
  iterations = VAULT_ITERATIONS,
): Promise<{ record: VaultRecord; key: CryptoKey }> {
  const raw = randomBytes(32)
  const record = await wrapVault(pin, raw, iterations)
  return { record, key: await importAesKey(raw) }
}

async function wrapVault(pin: string, raw: Bytes, iterations: number): Promise<VaultRecord> {
  const salt = randomBytes(16)
  const wrapped = await sealBytes(await passKey(pin, salt, iterations), raw)
  return { salt: b64(salt), iterations, wrapped }
}

async function unwrapVault(pin: string, record: VaultRecord): Promise<Bytes | null> {
  return openBytes(await passKey(pin, unb64(record.salt), record.iterations), record.wrapped)
}

export async function openVault(pin: string, record: VaultRecord): Promise<CryptoKey | null> {
  const raw = await unwrapVault(pin, record)
  return raw ? importAesKey(raw) : null
}

export async function changeVaultPin(oldPin: string, newPin: string, record: VaultRecord): Promise<VaultRecord | null> {
  const raw = await unwrapVault(oldPin, record)
  return raw ? wrapVault(newPin, raw, record.iterations) : null
}

export async function sealJson(key: CryptoKey, value: unknown): Promise<string> {
  return sealBytes(key, utf8(JSON.stringify(value)))
}

export async function openJson<T>(key: CryptoKey, body: string): Promise<T | null> {
  const pt = await openBytes(key, body)
  if (!pt) return null
  try {
    return JSON.parse(td.decode(pt)) as T
  } catch {
    return null
  }
}
