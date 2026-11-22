// Small byte helpers shared by the app, the tests and the worker.
export type Bytes = Uint8Array<ArrayBuffer>

export const te = new TextEncoder()
export const td = new TextDecoder()

export function utf8(s: string): Bytes {
  return te.encode(s) as Bytes
}

export function b64(u8: Uint8Array): string {
  let s = ""
  for (let i = 0; i < u8.length; i += 0x8000) {
    s += String.fromCharCode(...u8.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

export function unb64(s: string): Bytes {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function b64url(u8: Uint8Array): string {
  return b64(u8).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function unb64url(s: string): Bytes {
  const t = s.replace(/-/g, "+").replace(/_/g, "/")
  return unb64(t + "=".repeat((4 - (t.length % 4)) % 4))
}

export function hex(u8: Uint8Array): string {
  return Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("")
}

export function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export function randomBytes(n: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(n))
}

export function randomId(): string {
  return hex(randomBytes(12))
}

export async function sha256(data: Uint8Array): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data as Bytes))
}
