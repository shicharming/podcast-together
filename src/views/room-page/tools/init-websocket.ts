import util from "../../../utils/util"
import { WsMsgRes } from "../../../type/type-room-page"

interface WsCallbacks {
  onopen?: (socket: Event) => void
  onmessage?: (res: WsMsgRes) => void
  onclose?: (res: CloseEvent) => void
  onerror?: (res: Event) => void
}

export function initWebSocket(callbacks: WsCallbacks, roomId?: string) {
  const _env = util.getEnv()
  const { WEBSOCKET_URL } = _env
  // Support a relative WS path (e.g. "/pt-api/ws") for same-origin dev proxying,
  // as well as an absolute wss:// URL in production.
  let base = WEBSOCKET_URL
  if(base.startsWith("/")) {
    const proto = location.protocol === "https:" ? "wss:" : "ws:"
    base = `${proto}//${location.host}${base}`
  }
  // roomId is carried in the URL so the backend can route to the room's
  // Durable Object at connection time (before the FIRST_SEND message).
  let url = base
  if(roomId) {
    url += (base.includes("?") ? "&" : "?") + "roomId=" + encodeURIComponent(roomId)
  }
  let ws = new WebSocket(url)
  ws.onopen = (socket: Event) => {
    console.log("ws opened.........")
    console.log(socket)
    console.log(" ")
    callbacks.onopen && callbacks.onopen(socket)
  }

  ws.onmessage = (res) => {
    const message = res.data
    const msgRes = util.strToObj<WsMsgRes>(message)
    
    if(!msgRes) return
    callbacks.onmessage && callbacks.onmessage(msgRes)
  }

  ws.onclose = (res) => {
    console.log("ws.onclose.......")
    console.log(`res: `, res)
    console.log(` `)
    callbacks.onclose && callbacks.onclose(res)
  }

  ws.onerror = (res) => {
    console.log("ws.onerror.......")
    console.log(res)
    console.log(" ")
    callbacks.onerror && callbacks.onerror(res)
  }
  return ws
}


export function sendToWebSocket(ws: WebSocket | null, obj: Record<string, any>): boolean {
  if(!obj["x-pt-version"]) obj["x-pt-version"] = PT_ENV.version
  if(!obj["x-pt-client"]) obj["x-pt-client"] = PT_ENV.client
  let msg: string
  try {
    msg = JSON.stringify(obj)
  }
  catch(err) {
    console.log("解析失败")
    console.log(err)
    return false
  }
  if(!ws) {
    console.log("ws 不存在，无法发送...........")
    console.log(" ")
    return false
  }
  
  if(obj.operateType === "SET_PLAYER") {
    console.log("使用 web-socket 操作播放器消息: ")
    console.log(obj)
    console.log(" ")
  }
  

  try {
    ws.send(msg)
  }
  catch(err) {
    console.log("使用 web-socket 发送消息失败.......")
    console.log(err)
    console.log(" ")
    return false
  }
  return true
}
