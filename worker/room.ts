// One Durable Object per couple: a mailbox for two devices.
// It stores sealed bodies only until the other phone acknowledges them, then
// deletes them. It never has the key to read them.
import { DurableObject } from "cloudflare:workers"
import { hex, sha256, unb64 } from "../src/core/bytes"
import { MAX_BODY, type C2S, type S2C } from "../src/core/protocol"
import { sendEmptyPush } from "./push"

const MAX_DEVICES = 2
const KEEP_UNDELIVERED_MS = 30 * 24 * 3600 * 1000
const PUSH_GAP_MS = 15_000 // at most one notification every 15 s

interface Attachment {
  device: string | null
}

export class Room extends DurableObject<Env> {
  private sql: SqlStorage

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY, sub TEXT, last_push INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS msgs (seq INTEGER PRIMARY KEY AUTOINCREMENT, sender TEXT NOT NULL, cid TEXT NOT NULL, body TEXT NOT NULL, ts INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (device TEXT NOT NULL, cid TEXT NOT NULL);
    `)
    // Keep-alive pings are answered without waking the object up.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'))
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 })
    const origin = new URL(req.url).origin
    this.sql.exec("INSERT OR REPLACE INTO meta (k, v) VALUES ('origin', ?)", origin)
    const pair = new WebSocketPair()
    this.ctx.acceptWebSocket(pair[1])
    pair[1].serializeAttachment({ device: null } satisfies Attachment)
    return new Response(null, { status: 101, webSocket: pair[0] })
  }

  // ---- helpers -------------------------------------------------------------

  private send(ws: WebSocket, msg: S2C) {
    try {
      ws.send(JSON.stringify(msg))
    } catch {
      /* socket already gone */
    }
  }

  private deviceOf(ws: WebSocket): string | null {
    return (ws.deserializeAttachment() as Attachment | null)?.device ?? null
  }

  private socketsFor(device: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((w) => this.deviceOf(w) === device)
  }

  private peerSockets(device: string): WebSocket[] {
    return this.ctx.getWebSockets().filter((w) => {
      const d = this.deviceOf(w)
      return d !== null && d !== device
    })
  }

  private meta(k: string): string | null {
    const row = this.sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = ?", k).toArray()[0]
    return row?.v ?? null
  }

  // ---- socket events -------------------------------------------------------

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > MAX_BODY + 1000) {
      return this.send(ws, { t: "error", code: "too_big" })
    }
    let msg: C2S
    try {
      msg = JSON.parse(raw) as C2S
    } catch {
      return this.send(ws, { t: "error", code: "bad" })
    }

    const device = this.deviceOf(ws)
    if (msg.t === "hello") return this.hello(ws, msg)
    if (!device) return this.send(ws, { t: "error", code: "auth" })

    switch (msg.t) {
      case "send":
        return this.onSend(ws, device, msg.cid, msg.body)
      case "ack":
        return this.onAck(device, msg.seqs)
      case "sub":
        this.sql.exec(
          "UPDATE devices SET sub = ? WHERE id = ?",
          msg.sub ? JSON.stringify(msg.sub) : null,
          device,
        )
        return
      case "typing":
        for (const p of this.peerSockets(device)) this.send(p, { t: "typing" })
        return
      case "end":
        return this.end()
    }
  }

  private async hello(ws: WebSocket, msg: Extract<C2S, { t: "hello" }>) {
    if (typeof msg.auth !== "string" || typeof msg.device !== "string" || !/^[0-9a-f]{24}$/.test(msg.device)) {
      return this.send(ws, { t: "error", code: "bad" })
    }
    const authHash = hex(await sha256(unb64(msg.auth)))
    const stored = this.meta("auth")
    if (stored === null) {
      this.sql.exec("INSERT INTO meta (k, v) VALUES ('auth', ?)", authHash)
    } else if (stored !== authHash) {
      this.send(ws, { t: "error", code: "auth" })
      return ws.close(4001, "auth")
    }

    const known = this.sql.exec("SELECT id FROM devices WHERE id = ?", msg.device).toArray().length > 0
    if (!known) {
      const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM devices").one().n
      if (count >= MAX_DEVICES) {
        this.send(ws, { t: "error", code: "full" })
        return ws.close(4002, "full")
      }
      this.sql.exec("INSERT INTO devices (id) VALUES (?)", msg.device)
    }

    // A newer tab on the same phone replaces the old one.
    for (const old of this.socketsFor(msg.device)) if (old !== ws) old.close(4000, "replaced")
    ws.serializeAttachment({ device: msg.device } satisfies Attachment)

    const peers = this.peerSockets(msg.device)
    this.send(ws, { t: "ready", peerOnline: peers.length > 0 })
    for (const p of peers) this.send(p, { t: "presence", online: true })

    // Everything the other phone sent while we were away.
    const rows = this.sql
      .exec<{ seq: number; body: string; ts: number }>(
        "SELECT seq, body, ts FROM msgs WHERE sender != ? ORDER BY seq",
        msg.device,
      )
      .toArray()
    for (const r of rows) this.send(ws, { t: "msg", seq: r.seq, body: r.body, ts: r.ts })

    const receipts = this.sql
      .exec<{ cid: string }>("SELECT cid FROM receipts WHERE device = ?", msg.device)
      .toArray()
      .map((r) => r.cid)
    if (receipts.length) {
      this.send(ws, { t: "delivered", cids: receipts })
      this.sql.exec("DELETE FROM receipts WHERE device = ?", msg.device)
    }

    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + 24 * 3600 * 1000)
    }
  }

  private async onSend(ws: WebSocket, device: string, cid: string, body: string) {
    if (typeof cid !== "string" || cid.length > 64 || typeof body !== "string") {
      return this.send(ws, { t: "error", code: "bad" })
    }
    if (body.length > MAX_BODY) return this.send(ws, { t: "error", code: "too_big" })
    const ts = Date.now()
    const seq = this.sql
      .exec<{ seq: number }>(
        "INSERT INTO msgs (sender, cid, body, ts) VALUES (?, ?, ?, ?) RETURNING seq",
        device,
        cid,
        body,
        ts,
      )
      .one().seq
    this.send(ws, { t: "sent", cid })

    const peers = this.peerSockets(device)
    if (peers.length) {
      for (const p of peers) this.send(p, { t: "msg", seq, body, ts })
    } else {
      await this.notifyPeer(device)
    }
  }

  private onAck(device: string, seqs: number[]) {
    if (!Array.isArray(seqs) || !seqs.length) return
    const ids = seqs.filter((n) => Number.isInteger(n)).slice(0, 500)
    const bySender = new Map<string, string[]>()
    for (const seq of ids) {
      const row = this.sql
        .exec<{ sender: string; cid: string }>("SELECT sender, cid FROM msgs WHERE seq = ? AND sender != ?", seq, device)
        .toArray()[0]
      if (!row) continue
      this.sql.exec("DELETE FROM msgs WHERE seq = ?", seq)
      bySender.set(row.sender, [...(bySender.get(row.sender) ?? []), row.cid])
    }
    for (const [sender, cids] of bySender) {
      const sockets = this.socketsFor(sender)
      if (sockets.length) for (const s of sockets) this.send(s, { t: "delivered", cids })
      else for (const cid of cids) this.sql.exec("INSERT INTO receipts (device, cid) VALUES (?, ?)", sender, cid)
    }
  }

  private async notifyPeer(sender: string) {
    const now = Date.now()
    const peers = this.sql
      .exec<{ id: string; sub: string | null; last_push: number }>(
        "SELECT id, sub, last_push FROM devices WHERE id != ?",
        sender,
      )
      .toArray()
    const subject = this.meta("origin") ?? "https://raaz.app"
    for (const p of peers) {
      if (!p.sub || now - p.last_push < PUSH_GAP_MS) continue
      this.sql.exec("UPDATE devices SET last_push = ? WHERE id = ?", now, p.id)
      try {
        const { endpoint } = JSON.parse(p.sub) as { endpoint: string }
        const status = await sendEmptyPush(endpoint, this.env, subject)
        if (status === 404 || status === 410) this.sql.exec("UPDATE devices SET sub = NULL WHERE id = ?", p.id)
      } catch {
        /* a failed notification must never lose the message */
      }
    }
  }

  private async end() {
    for (const w of this.ctx.getWebSockets()) {
      this.send(w, { t: "ended" })
      w.close(4003, "ended")
    }
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  async webSocketClose(ws: WebSocket) {
    this.left(ws)
  }

  async webSocketError(ws: WebSocket) {
    this.left(ws)
  }

  private left(ws: WebSocket) {
    const device = this.deviceOf(ws)
    if (!device) return
    const stillHere = this.socketsFor(device).some((w) => w !== ws)
    if (stillHere) return
    for (const p of this.peerSockets(device)) this.send(p, { t: "presence", online: false })
  }

  async alarm() {
    this.sql.exec("DELETE FROM msgs WHERE ts < ?", Date.now() - KEEP_UNDELIVERED_MS)
    const left = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM devices").one().n
    if (left > 0) await this.ctx.storage.setAlarm(Date.now() + 24 * 3600 * 1000)
  }
}
