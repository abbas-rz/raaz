// One Durable Object per invite. It holds two public keys for at most
// 15 minutes, then deletes itself.
import { DurableObject } from "cloudflare:workers"
import { INVITE_TTL_MS } from "../src/core/protocol"

interface Side {
  pk: string
  mac: string
}
interface InviteState {
  a: Side
  b?: Side
  created: number
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })

function readSide(v: unknown): Side | null {
  if (!v || typeof v !== "object") return null
  const { pk, mac } = v as Record<string, unknown>
  if (typeof pk !== "string" || typeof mac !== "string") return null
  if (pk.length > 64 || mac.length > 64) return null
  return { pk, mac }
}

export class Invite extends DurableObject<Env> {
  private async load(): Promise<InviteState | null> {
    const s = await this.ctx.storage.get<InviteState>("s")
    if (s && Date.now() - s.created > INVITE_TTL_MS) {
      await this.ctx.storage.deleteAll()
      return null
    }
    return s ?? null
  }

  async fetch(req: Request): Promise<Response> {
    const join = new URL(req.url).pathname.endsWith("/join")
    const state = await this.load()

    if (req.method === "GET") return state ? json(state) : json({ error: "not_found" }, 404)

    if (req.method === "DELETE") {
      await this.ctx.storage.deleteAll()
      await this.ctx.storage.deleteAlarm()
      return json({ ok: true })
    }

    if (req.method !== "POST") return json({ error: "method" }, 405)
    const side = readSide(await req.json().catch(() => null))
    if (!side) return json({ error: "bad" }, 400)

    if (!join) {
      if (state) return json({ error: "taken" }, 409)
      await this.ctx.storage.put<InviteState>("s", { a: side, created: Date.now() })
      await this.ctx.storage.setAlarm(Date.now() + INVITE_TTL_MS)
      return json({ ok: true })
    }

    if (!state) return json({ error: "not_found" }, 404)
    if (state.b) return json({ error: "taken" }, 409)
    await this.ctx.storage.put<InviteState>("s", { ...state, b: side })
    return json({ ok: true })
  }

  async alarm() {
    await this.ctx.storage.deleteAll()
  }
}
