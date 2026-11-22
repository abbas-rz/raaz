// raaz server: static app + two tiny Durable Objects.
//   /api/invite/:id[/join]  short-lived meeting point for pairing
//   /api/room/:id           WebSocket mailbox for one couple
//   /api/vapid              public key the phones need to subscribe to push
// Everything else is the PWA, served straight from static assets.
export { Invite } from "./invite"
export { Room } from "./room"

const ID = "([0-9a-f]{32})"
const INVITE = new RegExp(`^/api/invite/${ID}(/join)?$`)
const ROOM = new RegExp(`^/api/room/${ID}$`)

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)

    const invite = url.pathname.match(INVITE)
    if (invite) return env.INVITE.get(env.INVITE.idFromName(invite[1])).fetch(req)

    const room = url.pathname.match(ROOM)
    if (room) return env.ROOM.get(env.ROOM.idFromName(room[1])).fetch(req)

    if (url.pathname === "/api/vapid") {
      return Response.json({ key: env.VAPID_PUBLIC }, { headers: { "cache-control": "no-store" } })
    }

    return new Response("not found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
