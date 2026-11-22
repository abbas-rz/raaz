// Everything that travels between the two phones is a Payload, sealed with the
// shared message key. The server only ever sees Wire frames with opaque bodies.

interface Base {
  id: string
  ts: number
}

export type Payload =
  | (Base & { k: "text"; text: string })
  // secs: seconds a view-once snap stays on screen. null keeps the photo in the chat.
  | (Base & { k: "snap"; mime: string; data: string; secs: number | null; caption?: string })
  | (Base & { k: "opened"; ref: string })
  | (Base & { k: "react"; ref: string; emoji: string | null })
  | (Base & { k: "nudge" })
  | (Base & { k: "locreq" })
  | (Base & { k: "loc"; lat: number; lon: number; acc: number })
  | (Base & { k: "locno" })
  // hours: how long messages stay. 0 means keep them.
  | (Base & { k: "timer"; hours: number })
  | (Base & { k: "clear" })

export type PayloadKind = Payload["k"]

// Client to server
export type C2S =
  | { t: "hello"; auth: string; device: string }
  | { t: "send"; cid: string; body: string }
  | { t: "ack"; seqs: number[] }
  | { t: "sub"; sub: PushSubscriptionJSONLike | null }
  | { t: "typing" }
  | { t: "end" }

// Server to client
export type S2C =
  | { t: "ready"; peerOnline: boolean }
  | { t: "msg"; seq: number; body: string; ts: number }
  | { t: "sent"; cid: string }
  | { t: "delivered"; cids: string[] }
  | { t: "presence"; online: boolean }
  | { t: "typing" }
  | { t: "ended" }
  | { t: "error"; code: "auth" | "full" | "too_big" | "bad" }
  | { t: "pong" }

export interface PushSubscriptionJSONLike {
  endpoint: string
  keys?: Record<string, string>
}

// Biggest sealed body the server accepts. Snaps are compressed to fit well under it.
export const MAX_BODY = 900_000

export const INVITE_TTL_MS = 15 * 60 * 1000
