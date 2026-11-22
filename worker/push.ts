// Sends an empty, VAPID-signed Web Push. Empty means there is nothing to
// encrypt and nothing for Google/Apple/Mozilla to read: the phone's service
// worker shows a neutral notification on its own.
import { b64url, unb64url, utf8 } from "../src/core/bytes"

// Only real push services, so the mailbox can't be used to POST anywhere else.
export function isPushEndpoint(endpoint: string): boolean {
  let host: string
  try {
    const u = new URL(endpoint)
    if (u.protocol !== "https:") return false
    host = u.hostname
  } catch {
    return false
  }
  return (
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com" ||
    host === "web.push.apple.com" ||
    host.endsWith(".push.apple.com") ||
    host.endsWith(".notify.windows.com")
  )
}

async function vapidJwt(aud: string, subject: string, pub: string, priv: string): Promise<string> {
  const header = b64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })))
  const claims = b64url(
    utf8(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })),
  )
  const p = unb64url(pub)
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", d: priv, x: b64url(p.slice(1, 33)), y: b64url(p.slice(33, 65)), ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(`${header}.${claims}`))
  return `${header}.${claims}.${b64url(new Uint8Array(sig))}`
}

// Returns the push service's HTTP status, or 0 if we didn't try.
export async function sendEmptyPush(
  endpoint: string,
  env: { VAPID_PUBLIC: string; VAPID_PRIVATE?: string },
  subject: string,
): Promise<number> {
  if (!env.VAPID_PRIVATE || !isPushEndpoint(endpoint)) return 0
  const jwt = await vapidJwt(new URL(endpoint).origin, subject, env.VAPID_PUBLIC, env.VAPID_PRIVATE)
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      TTL: "86400",
      Urgency: "high",
      "Content-Length": "0",
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`,
    },
  })
  return res.status
}
