// Entry Worker: HTTP router + WebSocket routing to the per-room Durable Object.
// Endpoints match the frontend contract (src/request/api.ts):
//   POST /parse-text, POST /parse-transcript, POST /room-operate, POST /pt-service, WS /ws?roomId=...

import { RoomDO } from "./room-do"
import { handleParse } from "./parse"
import { handleParseTranscript } from "./transcript"
import type { Env } from "./types"

export { RoomDO }

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  })
}

// roomId: short, url-safe, no ambiguous chars.
function genRoomId(): string {
  const ABC = "abcdefghijkmnopqrstuvwxyz23456789"
  let s = ""
  for (let i = 0; i < 8; i++) s += ABC[Math.floor(Math.random() * ABC.length)]
  return s
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname

    if (req.method === "OPTIONS") return new Response(null, { headers: CORS })

    // WebSocket → route to the room DO.
    if (path.endsWith("/ws")) {
      const roomId = url.searchParams.get("roomId")
      if (!roomId) return new Response("missing roomId", { status: 400 })
      if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("expected websocket", { status: 426 })
      }
      const stub = env.ROOM.get(env.ROOM.idFromName(roomId))
      return stub.fetch(req)
    }

    if (req.method !== "POST") return json({ code: "E4005" }, 405)

    // Server clock for the frontend's time calibration (time.ts).
    if (path.endsWith("/pt-service")) {
      return json({ code: "0000", data: { stamp: Date.now() } })
    }

    let body: Record<string, any>
    try {
      body = await req.json()
    } catch {
      return json({ code: "E4000" })
    }

    if (path.endsWith("/parse-text")) {
      return json(await handleParse(body))
    }

    if (path.endsWith("/parse-transcript")) {
      return json(await handleParseTranscript(body))
    }

    if (path.endsWith("/room-operate")) {
      const op = body.operateType
      let roomId: string = body.roomId
      if (op === "CREATE") roomId = genRoomId()
      if (!roomId) return json({ code: "E4000" })

      // Capture UA for participant records.
      body.userAgent = req.headers.get("user-agent") ?? undefined
      body.roomId = roomId

      const stub = env.ROOM.get(env.ROOM.idFromName(roomId))
      const res = await stub.fetch("https://do/op", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      return json(data, res.status)
    }

    return json({ code: "E4044" }, 404)
  },
}
