// Room Durable Object — one instance per room.
// Ports cloud-functions/src/room-operate.ts (CREATE/ENTER/HEARTBEAT/LEAVE),
// web-socket.ts (FIRST_SEND/SET_PLAYER/HEARTBEAT sync) and room-clock.ts
// (stale-heartbeat auto-pause + TTL cleanup, now via DO alarms).
// Adds: SEND_REACTION, ADD_NOTE, SET_CONTENT, and a pause "reason".

import type {
  Env,
  Room,
  Participant,
  ParticipantClient,
  ContentData,
  ClientState,
  RoRes,
  ResType,
  Note,
  StudyState,
  StudyStatus,
  TimerConfig,
  TimerPhase,
  TodoItem,
} from "./types"

const MAX_ROOM_NUM = 15
const MIN_DURATION_FOR_A_PERSON = 250 // ms; throttle same operator
const KICK_MS = 50 * 1000 // drop participants with no heartbeat for 50s
const ROOM_TTL_MS = 12 * 60 * 60 * 1000 // 12h room lifetime
const ALARM_INTERVAL_MS = 30 * 1000
const CLIENT_STATES = new Set<ClientState>(["visible", "hidden", "idle", "reconnecting"])

const defaultRoomCfg = { everyoneCanOperatePlayer: "Y" as const }

// ---- Study Mode defaults & caps ----
const DEFAULT_TIMER_CONFIG: TimerConfig = {
  focusMs: 25 * 60 * 1000,
  shortBreakMs: 5 * 60 * 1000,
  longBreakMs: 15 * 60 * 1000,
  roundsBeforeLong: 4,
}
const STUDY_STATUSES = new Set<StudyStatus>(["working", "stuck", "done", "away", "break"])
const MAX_TODOS_PER_USER = 30
const MAX_TODO_LEN = 200
const clampMs = (v: number, min: number, max: number) =>
  isNaN(v) ? min : Math.min(max, Math.max(min, v))

function defaultStudy(): StudyState {
  const now = Date.now()
  return {
    timer: {
      phase: "focus",
      isRunning: false,
      startStamp: now,
      elapsedMs: 0,
      durationMs: DEFAULT_TIMER_CONFIG.focusMs,
      completedFocusRounds: 0,
      operator: "",
      operateStamp: now,
      config: { ...DEFAULT_TIMER_CONFIG },
    },
    todos: {},
    statuses: {},
  }
}

function phaseDuration(phase: TimerPhase, cfg: TimerConfig): number {
  if (phase === "focus") return cfg.focusMs
  if (phase === "long_break") return cfg.longBreakMs
  return cfg.shortBreakMs
}

export class RoomDO {
  private ctx: DurableObjectState
  private env: Env
  private room: Room | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.env = env
    this.ctx.blockConcurrencyWhile(async () => {
      this.room = (await this.ctx.storage.get<Room>("room")) ?? null
    })
  }

  private async save() {
    if (this.room) await this.ctx.storage.put("room", this.room)
  }

  async fetch(req: Request): Promise<Response> {
    // WebSocket upgrade
    if (req.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair()
      const client = pair[0]
      const server = pair[1]
      this.ctx.acceptWebSocket(server)
      server.send(JSON.stringify({ responseType: "CONNECTED" }))
      return new Response(null, { status: 101, webSocket: client })
    }

    // Otherwise a room-operate op forwarded by the entry Worker.
    let body: Record<string, any>
    try {
      body = await req.json()
    } catch {
      return this.jsonRes({ code: "E4000" })
    }
    const data = await this.handleOp(body)
    return this.jsonRes(data)
  }

  private jsonRes(data: ResType): Response {
    return new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json" },
    })
  }

  // ---------------- HTTP ops (room-operate) ----------------

  private async handleOp(body: Record<string, any>): Promise<ResType> {
    const op = body.operateType
    const err = this.checkEntry(body)
    if (err) return err

    if (op === "CREATE") return this.handleCreate(body)
    if (op === "ENTER") return this.handleEnter(body)
    if (op === "HEARTBEAT") return this.handleHeartbeat(body)
    if (op === "LEAVE") return this.handleLeave(body)
    return { code: "E4044" }
  }

  private checkEntry(body: Record<string, any>): ResType | null {
    const localId = body["x-pt-local-id"]
    if (!localId) return { code: "E4000" }
    const { operateType, nickName, roomId } = body
    const oTypes = ["CREATE", "ENTER", "HEARTBEAT", "LEAVE"]
    if (!oTypes.includes(operateType)) return { code: "E4000" }
    if (!nickName && operateType !== "CREATE") return { code: "E4000" }
    if (!roomId && operateType !== "CREATE") return { code: "E4000" }
    if (operateType === "CREATE") {
      // A room may be created podcast-less (pure focus room). Only validate
      // content when it is provided.
      const roomData: ContentData | undefined = body.roomData
      if (roomData) {
        if (roomData.infoType !== "podcast") return { code: "E4000" }
        if (!roomData.audioUrl) return { code: "E4000", errMsg: "roomData.audioUrl is required" }
      }
    }
    return null
  }

  private async handleCreate(body: Record<string, any>): Promise<ResType> {
    const clientId = body["x-pt-local-id"]
    const roomId = body.roomId as string
    const roomData = body.roomData as ContentData | undefined
    const now = Date.now()

    this.room = {
      roomId,
      content: roomData,
      oState: "OK",
      playStatus: "PAUSED",
      speedRate: "1",
      contentStamp: 0,
      operateStamp: now,
      operator: "",
      createStamp: now,
      expiresAt: now + ROOM_TTL_MS,
      owner: clientId,
      participants: [],
      notes: [],
      config: { ...defaultRoomCfg },
      study: defaultStudy(),
    }
    await this.save()
    await this.scheduleAlarm()

    const roRes: RoRes = {
      roomId,
      content: roomData,
      playStatus: "PAUSED",
      speedRate: "1",
      operator: "",
      contentStamp: 0,
      operateStamp: now,
      participants: [],
      everyoneCanOperatePlayer: this.room.config.everyoneCanOperatePlayer,
      study: this.room.study,
    }
    return { code: "0000", data: roRes }
  }

  // Existing rooms persisted before Study Mode won't have a study object.
  private ensureStudy(room: Room): StudyState {
    if (!room.study) room.study = defaultStudy()
    return room.study
  }

  private async handleEnter(body: Record<string, any>): Promise<ResType> {
    const clientId = body["x-pt-local-id"]
    const { roomId, nickName } = body
    const ua = body.userAgent
    const clientState = this.normalizeClientState(body.clientState)

    const room = this.room
    if (!room || room.roomId !== roomId) return { code: "E4004" }
    if (room.oState === "EXPIRED") return { code: "E4006" }
    if (room.oState === "DELETED") return { code: "E4004" }

    const now = Date.now()
    let participants = room.participants ?? []
    let guestId = ""
    let me = participants.find((v) => v.nonce === clientId)
    if (me) {
      guestId = me.guestId
      me.nickName = nickName
      me.enterStamp = now
      me.heartbeatStamp = now
      if (ua) me.userAgent = ua
      this.touchParticipantState(me, clientState, now)
    } else {
      if (participants.length >= MAX_ROOM_NUM) return { code: "R0001" }
      guestId = this.generateGuestId(participants)
      me = { nickName, enterStamp: now, heartbeatStamp: now, userAgent: ua, guestId, nonce: clientId }
      this.touchParticipantState(me, clientState, now)
      participants.push(me)
    }

    participants = participants.filter((v) => now - v.heartbeatStamp < 60 * 1000)
    room.participants = participants
    await this.save()
    await this.scheduleAlarm()

    const roRes: RoRes = {
      ...this.buildRoRes(room),
      guestId,
      iamOwner: room.owner === clientId ? "Y" : "N",
    }
    return { code: "0000", data: roRes }
  }

  private async handleHeartbeat(body: Record<string, any>): Promise<ResType> {
    const clientId = body["x-pt-local-id"]
    const { roomId, nickName } = body

    const room = this.room
    if (!room || room.roomId !== roomId) return { code: "E4004" }
    if (room.oState === "EXPIRED") return { code: "E4006" }
    if (room.oState === "DELETED") return { code: "E4004" }

    const now = Date.now()
    let participants = room.participants ?? []
    const me = participants.find((v) => v.nonce === clientId)
    if (!me) return { code: "E4003" }
    me.heartbeatStamp = now
    me.nickName = nickName
    this.touchParticipantState(me, this.normalizeClientState(body.clientState), now)

    participants = participants.filter((v) => now - v.heartbeatStamp < KICK_MS)
    room.participants = participants
    await this.save()

    return { code: "0000", data: this.buildRoRes(room) }
  }

  private async handleLeave(body: Record<string, any>): Promise<ResType> {
    const clientId = body["x-pt-local-id"]
    const { roomId } = body
    const room = this.room
    if (!room || room.roomId !== roomId) return { code: "E4004" }
    if (room.oState === "EXPIRED") return { code: "E4006" }
    if (room.oState === "DELETED") return { code: "E4004" }

    let participants = room.participants ?? []
    if (participants.length < 1) return { code: "0000" }
    const me = participants.find((v) => v.nonce === clientId)
    if (!me) return { code: "E4003" }

    if (participants.length === 1) {
      this.pausePlayer(room)
      room.participants = []
      await this.save()
      return { code: "0000" }
    }
    room.participants = participants.filter((v) => v.nonce !== clientId)
    await this.save()
    return { code: "0000" }
  }

  private buildRoRes(room: Room): RoRes {
    const pClients: ParticipantClient[] = (room.participants ?? []).map((v) => ({
      nickName: v.nickName,
      guestId: v.guestId,
      heartbeatStamp: v.heartbeatStamp,
      enterStamp: v.enterStamp,
      clientState: v.clientState,
      lastActiveStamp: v.lastActiveStamp,
      lastVisibleStamp: v.lastVisibleStamp,
    }))
    return {
      roomId: room.roomId,
      content: room.content,
      playStatus: room.playStatus,
      speedRate: room.speedRate,
      operator: room.operator,
      contentStamp: room.contentStamp,
      operateStamp: room.operateStamp,
      participants: pClients,
      everyoneCanOperatePlayer: room.config.everyoneCanOperatePlayer,
      notes: room.notes ?? [],
      study: this.ensureStudy(room),
    }
  }

  private generateGuestId(participants: Participant[]): string {
    const ABC = "abcdefghijkmnopqrstuvwyz123456789"
    const ids = new Set(participants.map((v) => v.guestId))
    const gen = () => {
      let s = ""
      for (let i = 0; i < 11; i++) s += ABC[Math.floor(Math.random() * ABC.length)]
      return s
    }
    let id = ""
    let runs = 0
    while (!id) {
      const _id = gen()
      if (!ids.has(_id)) id = _id
      if (++runs > 15) break
    }
    return id
  }

  private normalizeClientState(value: unknown): ClientState {
    return CLIENT_STATES.has(value as ClientState) ? (value as ClientState) : "visible"
  }

  private touchParticipantState(participant: Participant, clientState: ClientState, now: number): void {
    participant.clientState = clientState
    if (clientState === "visible") {
      participant.lastVisibleStamp = now
      participant.lastActiveStamp = now
    } else if (clientState === "idle") {
      participant.lastVisibleStamp = participant.lastVisibleStamp || now
    }
  }

  // Compute the paused position from the last heartbeat (mirrors _pausePlayer).
  private pausePlayer(room: Room, operator = ""): void {
    if (room.playStatus === "PAUSED") return
    room.playStatus = "PAUSED"
    const participants = room.participants ?? []
    let speedRateNum = Number(room.speedRate)
    if (isNaN(speedRateNum) || speedRateNum >= 1.71) speedRateNum = 1
    if (participants.length > 0) {
      let lastHeartbeat = room.operateStamp
      for (const p of participants) if (p.heartbeatStamp > lastHeartbeat) lastHeartbeat = p.heartbeatStamp
      const diff = lastHeartbeat - room.operateStamp
      room.contentStamp = room.contentStamp + diff * speedRateNum
      room.operateStamp = Date.now()
      room.operator = operator
    }
  }

  // ---------------- WebSocket (sync) ----------------

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    let req: any
    try {
      req = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message))
    } catch {
      return
    }
    if (!this.checkWsReq(req)) {
      try { ws.close() } catch {}
      return
    }
    const op = req.operateType
    if (op === "FIRST_SEND") return this.wsFirstSend(ws, req)
    if (op === "SET_PLAYER") return this.wsSetPlayer(ws, req)
    if (op === "HEARTBEAT") return ws.send(JSON.stringify({ responseType: "HEARTBEAT" }))
    if (op === "SEND_REACTION") return this.wsReaction(ws, req)
    if (op === "ADD_NOTE") return this.wsAddNote(ws, req)
    if (op === "SET_CONTENT") return this.wsSetContent(ws, req)
    if (op === "TIMER_SET") return this.wsTimerSet(ws, req)
    if (op === "TODO_OP") return this.wsTodoOp(ws, req)
    if (op === "SET_STATUS") return this.wsSetStatus(ws, req)
  }

  async webSocketClose(ws: WebSocket) {
    try { ws.close() } catch {}
  }

  private checkWsReq(data: any): boolean {
    if (!data) return false
    const { operateType, roomId } = data
    if (!operateType || !roomId || !data["x-pt-local-id"] || !data["x-pt-stamp"]) return false
    if (operateType === "SET_PLAYER") {
      const { playStatus, speedRate, contentStamp } = data
      if (!playStatus || !speedRate) return false
      if (typeof contentStamp !== "number") return false
    }
    if (operateType === "SET_CONTENT") {
      const roomData: ContentData = data.roomData
      if (!roomData || roomData.infoType !== "podcast" || !roomData.audioUrl) return false
    }
    return true
  }

  private broadcast(obj: any) {
    const msg = JSON.stringify(obj)
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg) } catch {}
    }
  }

  private operatorGuestId(clientId: string): string | undefined {
    const room = this.room
    if (!room || room.oState !== "OK") return
    return room.participants.find((v) => v.nonce === clientId)?.guestId
  }

  private wsFirstSend(ws: WebSocket, req: any) {
    const room = this.room
    if (!room) { try { ws.close() } catch {}; return }
    const clientId = req["x-pt-local-id"]
    const guestId = this.operatorGuestId(clientId)
    if (!guestId) { try { ws.close() } catch {}; return }

    ws.serializeAttachment({ clientId })
    ws.send(
      JSON.stringify({
        responseType: "NEW_STATUS",
        roomStatus: {
          roomId: room.roomId,
          playStatus: room.playStatus,
          speedRate: room.speedRate,
          operator: room.operator,
          contentStamp: room.contentStamp,
          operateStamp: room.operateStamp,
          everyoneCanOperatePlayer: room.config.everyoneCanOperatePlayer,
          reason: room.pauseReason,
        },
      })
    )
    // Send existing timestamp notes so a joiner sees them.
    if (room.notes?.length) {
      ws.send(JSON.stringify({ responseType: "NOTES", notes: room.notes }))
    }
    // Send current study state so a joiner / refresher is in sync.
    ws.send(JSON.stringify({ responseType: "STUDY_STATE", study: this.ensureStudy(room) }))
  }

  private async wsSetPlayer(ws: WebSocket, req: any) {
    const room = this.room
    if (!room) return
    const clientId = req["x-pt-local-id"]
    const isOwner = room.owner === clientId
    if (!isOwner && room.config.everyoneCanOperatePlayer === "N") return

    const guestId = this.operatorGuestId(clientId)
    if (!guestId) { try { ws.close() } catch {}; return }

    const s1 = req["x-pt-stamp"] as number
    if (guestId === room.operator && s1 - room.operateStamp < MIN_DURATION_FOR_A_PERSON) return

    room.playStatus = req.playStatus
    room.speedRate = req.speedRate
    room.contentStamp = req.contentStamp
    room.operateStamp = s1
    room.operator = guestId
    room.pauseReason = req.playStatus === "PAUSED" ? (req.reason || "") : ""

    const roomStatus: any = {
      roomId: room.roomId,
      playStatus: room.playStatus,
      speedRate: room.speedRate,
      contentStamp: room.contentStamp,
      operateStamp: room.operateStamp,
      operator: guestId,
      reason: room.pauseReason,
    }
    if (req.everyoneCanOperatePlayer && isOwner) {
      room.config.everyoneCanOperatePlayer = req.everyoneCanOperatePlayer
      roomStatus.everyoneCanOperatePlayer = req.everyoneCanOperatePlayer
    }
    await this.save()
    await this.scheduleAlarm()
    this.broadcast({ responseType: "NEW_STATUS", roomStatus })
  }

  private async wsReaction(ws: WebSocket, req: any) {
    const room = this.room
    if (!room) return
    const clientId = req["x-pt-local-id"]
    const me = room.participants.find((v) => v.nonce === clientId)
    if (!me) return
    const emoji = String(req.emoji ?? "").slice(0, 8)
    if (!emoji) return
    const position = Number(req.position)
    this.broadcast({
      responseType: "REACTION",
      reaction: { emoji, nickName: me.nickName, guestId: me.guestId, stamp: Date.now() },
    })
    if (!isNaN(position)) {
      const note: Note = {
        noteId: crypto.randomUUID(),
        position,
        nickName: me.nickName,
        guestId: me.guestId,
        text: emoji,
        createdAt: Date.now(),
      }
      room.notes = room.notes ?? []
      room.notes.push(note)
      room.notes.sort((a, b) => a.position - b.position)
      await this.save()
      this.broadcast({ responseType: "NOTE", note })
    }
  }

  private async wsAddNote(ws: WebSocket, req: any) {
    const room = this.room
    if (!room) return
    const clientId = req["x-pt-local-id"]
    const me = room.participants.find((v) => v.nonce === clientId)
    if (!me) return
    const text = String(req.text ?? "").slice(0, 200)
    const position = Number(req.position)
    if (isNaN(position)) return
    const note: Note = {
      noteId: crypto.randomUUID(),
      position,
      nickName: me.nickName,
      guestId: me.guestId,
      text,
      createdAt: Date.now(),
    }
    room.notes = room.notes ?? []
    room.notes.push(note)
    room.notes.sort((a, b) => a.position - b.position)
    await this.save()
    this.broadcast({ responseType: "NOTE", note })
  }

  private async wsSetContent(ws: WebSocket, req: any) {
    const room = this.room
    if (!room) return
    const clientId = req["x-pt-local-id"]
    const isOwner = room.owner === clientId
    if (!isOwner && room.config.everyoneCanOperatePlayer === "N") return

    const guestId = this.operatorGuestId(clientId)
    if (!guestId) { try { ws.close() } catch {}; return }

    const now = req["x-pt-stamp"] as number
    room.content = req.roomData as ContentData
    room.playStatus = "PAUSED"
    room.speedRate = "1"
    room.contentStamp = 0
    room.operateStamp = now
    room.operator = guestId
    room.pauseReason = ""
    room.notes = []

    const roomStatus = {
      roomId: room.roomId,
      playStatus: room.playStatus,
      speedRate: room.speedRate,
      contentStamp: room.contentStamp,
      operateStamp: room.operateStamp,
      operator: guestId,
      everyoneCanOperatePlayer: room.config.everyoneCanOperatePlayer,
      reason: "",
    }

    await this.save()
    await this.scheduleAlarm()
    this.broadcast({
      responseType: "NEW_CONTENT",
      content: room.content,
      notes: room.notes,
      roomStatus,
    })
  }

  // ---------------- Study Mode (timer / todos / status) ----------------

  private broadcastStudy(room: Room) {
    this.broadcast({ responseType: "STUDY_STATE", study: room.study })
  }

  // Only participants may drive study state (open control, like the player).
  private studyActor(req: any): { room: Room; guestId: string } | null {
    const room = this.room
    if (!room) return null
    const guestId = this.operatorGuestId(req["x-pt-local-id"])
    if (!guestId) return null
    this.ensureStudy(room)
    return { room, guestId }
  }

  private async wsTimerSet(ws: WebSocket, req: any) {
    const actor = this.studyActor(req)
    if (!actor) return
    const { room, guestId } = actor
    const timer = room.study.timer
    const now = req["x-pt-stamp"] as number
    const action = req.action as string

    // Throttle rapid repeats from the same operator (mirror wsSetPlayer).
    if (guestId === timer.operator && Math.abs(now - timer.operateStamp) < MIN_DURATION_FOR_A_PERSON) return

    if (action === "start") {
      if (!timer.isRunning) {
        timer.isRunning = true
        timer.startStamp = now
      }
    } else if (action === "pause") {
      if (timer.isRunning) {
        timer.elapsedMs += Math.max(0, now - timer.startStamp)
        timer.isRunning = false
      }
    } else if (action === "reset") {
      timer.isRunning = false
      timer.elapsedMs = 0
      timer.startStamp = now
    } else if (action === "skip") {
      this.advancePhase(timer, now)
    } else if (action === "config") {
      const c = req.config ?? {}
      timer.config = {
        focusMs: clampMs(Number(c.focusMs), 60 * 1000, 180 * 60 * 1000),
        shortBreakMs: clampMs(Number(c.shortBreakMs), 60 * 1000, 60 * 60 * 1000),
        longBreakMs: clampMs(Number(c.longBreakMs), 60 * 1000, 60 * 60 * 1000),
        roundsBeforeLong: Math.min(8, Math.max(2, Math.floor(Number(c.roundsBeforeLong) || 4))),
      }
      // Reflect the new duration on the current (not-yet-started) phase.
      timer.durationMs = phaseDuration(timer.phase, timer.config)
    } else {
      return
    }

    timer.operator = guestId
    timer.operateStamp = now
    await this.save()
    this.broadcastStudy(room)
  }

  // focus → short/long break → focus; long break after every `roundsBeforeLong` focuses.
  private advancePhase(timer: Room["study"]["timer"], now: number) {
    if (timer.phase === "focus") {
      timer.completedFocusRounds += 1
      timer.phase = timer.completedFocusRounds % timer.config.roundsBeforeLong === 0 ? "long_break" : "short_break"
    } else {
      timer.phase = "focus"
    }
    timer.durationMs = phaseDuration(timer.phase, timer.config)
    timer.elapsedMs = 0
    timer.isRunning = false
    timer.startStamp = now
  }

  private async wsTodoOp(ws: WebSocket, req: any) {
    const actor = this.studyActor(req)
    if (!actor) return
    const { room, guestId } = actor
    const todos = room.study.todos
    const list = todos[guestId] ?? []
    const action = req.action as string

    if (action === "add") {
      const text = String(req.text ?? "").trim().slice(0, MAX_TODO_LEN)
      if (!text) return
      if (list.length >= MAX_TODOS_PER_USER) return
      const item: TodoItem = { id: crypto.randomUUID(), text, done: false, createdAt: Date.now() }
      list.push(item)
    } else if (action === "toggle") {
      const it = list.find((v) => v.id === req.todoId)
      if (!it) return
      it.done = !it.done
    } else if (action === "delete") {
      const idx = list.findIndex((v) => v.id === req.todoId)
      if (idx < 0) return
      list.splice(idx, 1)
    } else {
      return
    }

    if (list.length) todos[guestId] = list
    else delete todos[guestId]
    await this.save()
    this.broadcastStudy(room)
  }

  private async wsSetStatus(ws: WebSocket, req: any) {
    const actor = this.studyActor(req)
    if (!actor) return
    const { room, guestId } = actor
    const status = req.status as StudyStatus
    if (!STUDY_STATUSES.has(status)) return
    room.study.statuses[guestId] = status
    await this.save()
    this.broadcastStudy(room)
  }

  // ---------------- Alarm (room-clock) ----------------

  private async scheduleAlarm() {
    const cur = await this.ctx.storage.getAlarm()
    if (cur === null) await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS)
  }

  async alarm() {
    const room = this.room
    if (!room) return
    const now = Date.now()

    // Room expired → tear down.
    if (now > room.expiresAt || room.oState !== "OK") {
      this.room = null
      await this.ctx.storage.deleteAll()
      return
    }

    const before = room.participants.length
    room.participants = room.participants.filter((v) => now - v.heartbeatStamp < KICK_MS)
    const after = room.participants.length

    // Everyone left while playing → auto-pause at last-known position.
    if (after === 0 && room.playStatus === "PLAYING") {
      this.pausePlayer(room)
      await this.save()
      this.broadcast({
        responseType: "NEW_STATUS",
        roomStatus: {
          roomId: room.roomId,
          playStatus: room.playStatus,
          speedRate: room.speedRate,
          operator: room.operator,
          contentStamp: room.contentStamp,
          operateStamp: room.operateStamp,
          everyoneCanOperatePlayer: room.config.everyoneCanOperatePlayer,
        },
      })
    } else if (after !== before) {
      await this.save()
    }

    // Keep ticking while the room is alive.
    await this.ctx.storage.setAlarm(now + ALARM_INTERVAL_MS)
  }
}
