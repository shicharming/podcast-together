import { ref, reactive, onActivated, onDeactivated, onMounted, onUnmounted, nextTick } from "vue"
import { PageData, PageState, WsMsgRes, RoomStatus, PlayStatus, RevokeType, ClientState, StudyStatus, PlayerAck } from "../../../type/type-room-page"
import { ContentData, RequestRes, RoRes } from "../../../type"
import { RouteLocationNormalizedLoaded } from "vue-router"
import { useRouteAndPtRouter, PtRouter, goHome } from "../../../routes/pt-router"
import ptUtil from "../../../utils/pt-util"
import util from "../../../utils/util"
import time from "../../../utils/time"
import playerTool from "./player-tool"
import { showParticipants, handleShowMoreBox } from "./show-room"
import cui from "../../../components/custom-ui"
import images from "../../../images"
import ptApi from "../../../utils/pt-api"
import { initPlayer } from "./init-player"
import { initWebSocket, sendToWebSocket } from "./init-websocket"
import { shareData } from "./init-share"
import { request_enter, request_heartbeat, request_leave } from "./room-request"
import { request_parse } from "../../create-page/cp-request"

// 一些常量
const COLLECT_TIMEOUT = 300    // 收集最新状态的最小间隔
const MAX_HB_NUM = 960    // 心跳最多轮询次数；如果每 15s 一次，相当于 4hr

// 播放器
const INACTIVE_WARN_MS = 45 * 1000
const IDLE_PROMPT_MS = 8 * 60 * 1000
const REACTION_TTL_MS = 8 * 1000

let player: any;
const playerEl = ref<HTMLElement | null>(null)
let playStatus: PlayStatus = "PAUSED"    // 播放状态

// 路由
let router: PtRouter
let route: RouteLocationNormalizedLoaded

// web socket
let ws: WebSocket | null = null

// 绑定到页面的数据
const pageData: PageData = reactive({
  state: 1,
  roomId: "",
  participants: [],
  showMoreBox: false,   // 是否要展示 “展开更多” 的按钮
  amIOwner: false,
  everyoneCanOperatePlayer: "Y",
  reactions: [],
  notes: [],
  pauseNotice: "",
  activeMode: "listen",
  needsPlaybackResume: false,
  inactiveListeners: [],
  syncEvents: [],
  showSyncDrawer: false,
})

// 新功能相关的杂项
let pendingPauseReason = ""   // 下一次暂停时携带的理由
let reactionSeq = 0           // reaction 的自增 id

// 其他杂七杂八的数据
let nickName: string = ""
let localId: string = ""
let guestId: string = ""
let intervalHb: number = 0      // 维持心跳的 interval 的返回值
let timeoutCollect: number = 0  // 上报最新播放状态的 timeout 的返回值
let srcDuration: number = 0     // 资源总时长（秒），如果为 0 代表还没解析出来
let waitPlayer: Promise<boolean>
let latestStatus: RoomStatus    // 最新的播放器状态
let isShowingAutoPlayPolicy: boolean = false  // 当前是否已在展示 autoplay policy 的弹窗
let heartbeatNum = 0            // 心跳的次数
let receiveWsNum = 0            // 收到 web-socket 的次数
let pausedSec = 0               // 已经暂停的秒数

// 时间戳
let lastOperateLocalStamp = 0        // 上一个本地设置远端服务器的时间戳
let lastNewStatusFromWsStamp = 0    // 上一次收到 web-socket NEW_STATUS 的时间戳
let lastHeartbeatStamp = 0          // 上一次心跳的时间戳
let lastReConnectWs = 0

// ---- WS 可靠性：发送队列 / 看门狗 / 重连代数 ----
let wsGen = 0                                   // 每次重连 +1，作废旧的 checkWebSocket 定时器
let lastWsMsgStamp = 0                          // 最近一次收到任何 WS 消息（活连接每 15s 有心跳回声）
let pendingWsSends: Record<string, any>[] = []  // socket 未就绪时暂存的消息，连上后补发
let pendingCollect = false                      // 连上后需要重新采集并上报播放状态
let lastInteractionStamp = time.getLocalTime()
let idleCheckTimer = 0
let isSyncingRoom = false
let suppressLeaveOnce = false

// 是否为远端调整播放器状态，如果是，则在监听 player 各回调时不往下执行
let isRemoteSetSeek = false
let isRemoteSetPlaying = false
let isRemoteSetPaused = false
let isRemoteSetSpeedRate = false

// 播放器准备好的回调
type SimpleFunc = (param1: boolean) => void
let playerAlready: SimpleFunc


const toHome = () => {
  goHome(router)
}

const toContact = () => {
  router.push({ name: "contact" })
}

// 本地修改我的昵称，再上报远端
const toEditMyName = async (newName: string) => {
  if(pageData.state !== 3) return
  const participants = pageData.participants
  // 修改视图
  for(let i=0; i<participants?.length; i++) {
    const v = participants[i]
    if(v.isMe) v.nickName = newName
  }
  nickName = newName
  // 上报远端
  // 销毁心跳、再用新的心跳上报
  await request_heartbeat(pageData.roomId, nickName, getClientState())

  // 修改缓存
  let userData = ptUtil.getUserData()
  userData.nickName = newName
  ptUtil.setUserData(userData)
}

const onEveryoneCanOperatePlayerChange = (opt: { checked: boolean }) => {
  if(!pageData.amIOwner) return
  pageData.everyoneCanOperatePlayer = opt.checked ? "Y" : "N"
  collectLatestStatus()
}

const getClientState = (): ClientState => {
  if(typeof document !== "undefined" && document.hidden) return "hidden"
  const now = time.getLocalTime()
  if(now - lastInteractionStamp > IDLE_PROMPT_MS) return "idle"
  return "visible"
}

const markActive = () => {
  lastInteractionStamp = time.getLocalTime()
  updateInactiveListeners()
}

const updateInactiveListeners = () => {
  const now = time.getLocalTime()
  pageData.inactiveListeners = pageData.participants.filter(v => {
    if(v.isMe) return false
    if(v.clientState === "hidden" || v.clientState === "idle" || v.clientState === "reconnecting") return true
    const lastVisible = v.lastVisibleStamp || v.lastActiveStamp || v.heartbeatStamp
    return playStatus === "PLAYING" && now - lastVisible > INACTIVE_WARN_MS
  })
}

const pauseForInactiveListeners = () => {
  pauseWithReason("Waiting")
}

const continuePlayback = async () => {
  if(!player) return
  pageData.needsPlaybackResume = false
  try {
    const result = player.play()
    if(result?.catch) await result
  } catch {
    pageData.needsPlaybackResume = true
    sendPlayerAck(false, "autoplay")
    addSyncEvent("resume blocked by autoplay")
    return
  }
  sendPlayerAck(true)
}

async function syncRoomNow(forceReconnect = false) {
  if(!pageData.roomId || !nickName || isSyncingRoom) return
  isSyncingRoom = true
  pausedSec = 0
  try {
    let res = await request_heartbeat(pageData.roomId, nickName, getClientState())
    if(res?.code === "E4003") {
      res = await request_enter(pageData.roomId, nickName, getClientState())
      if(res?.code === "0000") guestId = res.data?.guestId ?? guestId
    }
    if(res?.code === "0000" && res.data) {
      addSyncEvent("http snapshot applied")
      applyRoomSnapshot(res.data as RoRes, "http", false)
      if(forceReconnect || !ws || ws.readyState >= WebSocket.CLOSING) connectWebSocket()
    }
  } finally {
    isSyncingRoom = false
  }
}

function setupActivityListeners() {
  const onActive = () => markActive()
  const onResume = () => {
    markActive()
    syncRoomNow(true)
  }
  const onVisibility = () => {
    if(document.hidden) {
      if(pageData.roomId && nickName) request_heartbeat(pageData.roomId, nickName, "hidden")
      return
    }
    onResume()
  }
  const events = ["pointerdown", "touchstart", "keydown", "mousemove"]
  events.forEach(v => window.addEventListener(v, onActive, { passive: true }))
  window.addEventListener("focus", onResume)
  window.addEventListener("pageshow", onResume)
  document.addEventListener("visibilitychange", onVisibility)
  idleCheckTimer = window.setInterval(() => {
    if(pageData.state !== 3 || document.hidden) return
    if(time.getLocalTime() - lastInteractionStamp <= IDLE_PROMPT_MS) return
    request_heartbeat(pageData.roomId, nickName, "idle")
    cui.showModal({
      title: "Still listening?",
      content: "Tap once to keep your room status active.",
      showCancel: false,
      confirmText: "I'm here",
    }).then(() => {
      markActive()
      request_heartbeat(pageData.roomId, nickName, "visible")
    })
  }, 60 * 1000)

  return () => {
    events.forEach(v => window.removeEventListener(v, onActive))
    window.removeEventListener("focus", onResume)
    window.removeEventListener("pageshow", onResume)
    document.removeEventListener("visibilitychange", onVisibility)
    if(idleCheckTimer) clearInterval(idleCheckTimer)
    idleCheckTimer = 0
  }
}

let cleanupActivityListeners: (() => void) | undefined

/*********** 新功能：reaction / 时间点笔记 / 暂停理由 ***********/

// 发送一个 emoji reaction
const sendReaction = (emoji: string) => {
  sendWs({
    operateType: "SEND_REACTION",
    roomId: pageData.roomId,
    "x-pt-local-id": localId,
    "x-pt-stamp": time.getTime(),
    emoji,
    position: getPlayerCurrentTimeMs(),
  })
}

// 收到 reaction 时，短暂显示后自动移除
function pushReaction(emoji: string, senderName: string) {
  const id = ++reactionSeq
  pageData.reactions.push({ id, emoji, nickName: senderName })
  setTimeout(() => {
    const idx = pageData.reactions.findIndex(v => v.id === id)
    if(idx >= 0) pageData.reactions.splice(idx, 1)
  }, REACTION_TTL_MS)
}

// 在当前播放位置打一个时间点笔记
const addNote = (text: string) => {
  const position = util.numToFix((player?.currentTime ?? 0) * 1000, 0)
  sendWs({
    operateType: "ADD_NOTE",
    roomId: pageData.roomId,
    "x-pt-local-id": localId,
    "x-pt-stamp": time.getTime(),
    position,
    text: text.slice(0, 200),
  })
}

// 收到笔记，去重后按位置排序插入
function mergeNote(note: PageData["notes"][number]) {
  if(pageData.notes.some(v => v.noteId === note.noteId)) return
  pageData.notes.push(note)
  pageData.notes.sort((a, b) => a.position - b.position)
}

// 点击某个时间点，跳转播放位置
const seekToNote = (positionMs: number) => {
  if(!player) return
  isRemoteSetSeek = false
  player.seek(positionMs / 1000)
}

const getPlayerCurrentTimeMs = (): number => {
  return util.numToFix((player?.currentTime ?? 0) * 1000, 0)
}

function addSyncEvent(text: string) {
  const stamp = new Date().toLocaleTimeString()
  pageData.syncEvents.unshift(`${stamp} ${text}`)
  if(pageData.syncEvents.length > 20) pageData.syncEvents.length = 20
}

const toggleSyncDrawer = () => {
  pageData.showSyncDrawer = !pageData.showSyncDrawer
}

const copySyncDiagnostics = async () => {
  const lines = [
    "Sunny Together diagnostics",
    `version=${PT_ENV.version}`,
    `room=${pageData.roomId}`,
    `ws=${ws?.readyState ?? "none"}`,
    `statusSeq=${latestStatus?.statusSeq ?? 0}`,
    `playStatus=${playStatus}`,
    `playerTimeMs=${getPlayerCurrentTimeMs()}`,
    `clientState=${getClientState()}`,
    `participants=${pageData.participants.map(v => `${v.nickName}:${v.syncHealth}:${v.lastPlayerAck?.statusSeq ?? "-"}`).join(", ")}`,
    ...pageData.syncEvents,
  ]
  try {
    await navigator.clipboard.writeText(lines.join("\n"))
    addSyncEvent("copied diagnostics")
  } catch {}
}

function updateParticipantsFromServer(participants: any[], statusSeq = latestStatus?.statusSeq ?? 0) {
  pageData.participants = showParticipants(participants, guestId, statusSeq)
  updateInactiveListeners()
}

function sendPlayerAck(applied: boolean, blockedReason?: PlayerAck["blockedReason"]) {
  if(!ws || !latestStatus?.statusSeq) return
  const ok = sendToWebSocket(ws, {
    operateType: "PLAYER_ACK",
    roomId: pageData.roomId,
    "x-pt-local-id": localId,
    "x-pt-stamp": time.getTime(),
    statusSeq: latestStatus.statusSeq,
    applied,
    playStatus,
    localContentStamp: getPlayerCurrentTimeMs(),
    blockedReason,
    receivedAt: lastNewStatusFromWsStamp || time.getLocalTime(),
    appliedAt: time.getLocalTime(),
  })
  if(ok) addSyncEvent(`sent PLAYER_ACK #${latestStatus.statusSeq} ${applied ? "applied" : blockedReason || "blocked"}`)
}

// 暂停并附上理由（摸鱼彩蛋）
const pauseWithReason = (reason: string) => {
  pendingPauseReason = reason
  if(!player) return
  if(playStatus === "PLAYING") {
    // 触发 player 的 pause 回调，进而带理由上报
    player.pause()
  } else {
    // 已经是暂停态，直接上报一次带理由的状态
    collectLatestStatus()
  }
}

// 带理由暂停时常驻显示，直到房间重新播放。
function showPauseNotice(operatorGuestId: string, reason: string) {
  const who = pageData.participants.find(v => v.guestId === operatorGuestId)?.nickName ?? "有人"
  pageData.pauseNotice = `${who} 暂停中：${reason}`
}

const replaceContent = async (link: string): Promise<boolean> => {
  if(!ws) return false
  const res = await request_parse(link)
  if(res?.code !== "0000" || !res.data) return false

  return sendWs({
    operateType: "SET_CONTENT",
    roomId: pageData.roomId,
    "x-pt-local-id": localId,
    "x-pt-stamp": time.getTime(),
    roomData: res.data,
  })
}

/*********** Study Mode：共享番茄钟 / todo / 状态 ***********/

const sendTimer = (
  action: "start" | "pause" | "reset" | "skip" | "config",
  config?: Record<string, number>,
) => {
  sendWs({
    operateType: "TIMER_SET",
    roomId: pageData.roomId,
    "x-pt-local-id": localId,
    "x-pt-stamp": time.getTime(),
    action,
    config,
  })
}

const sendTodo = (action: "add" | "toggle" | "delete", payload: { text?: string; todoId?: string }) => {
  sendWs({
    operateType: "TODO_OP",
    roomId: pageData.roomId,
    "x-pt-local-id": localId,
    "x-pt-stamp": time.getTime(),
    action,
    ...payload,
  })
}

const sendStatus = (status: StudyStatus) => {
  sendWs({
    operateType: "SET_STATUS",
    roomId: pageData.roomId,
    "x-pt-local-id": localId,
    "x-pt-stamp": time.getTime(),
    status,
  })
}

// 切换 listen/study tab（共享，所有人跟随最后切换的人）
const sendMode = (mode: "listen" | "study") => {
  pageData.activeMode = mode   // 本地即时切换
  sendWs({
    operateType: "SET_MODE",
    roomId: pageData.roomId,
    "x-pt-local-id": localId,
    "x-pt-stamp": time.getTime(),
    mode,
  })
}

// 从服务器时间戳计算番茄钟剩余毫秒（复用 time.getTime() 校准，不靠本地 interval 累计）
const getTimerRemainingMs = (): number => {
  const timer = pageData.study?.timer
  if(!timer) return 0
  const elapsed = timer.isRunning ? timer.elapsedMs + (time.getTime() - timer.startStamp) : timer.elapsedMs
  return Math.max(0, timer.durationMs - elapsed)
}

export const useRoomPage = () => {
  const rr = useRouteAndPtRouter()
  router = rr.router
  route = rr.route

  init()

  return {
    pageData,
    playerEl,
    route,
    router,
    toHome,
    toContact,
    toEditMyName,
    onEveryoneCanOperatePlayerChange,
    sendReaction,
    addNote,
    seekToNote,
    getPlayerCurrentTimeMs,
    pauseWithReason,
    replaceContent,
    continuePlayback,
    pauseForInactiveListeners,
    sendTimer,
    sendTodo,
    sendStatus,
    sendMode,
    getTimerRemainingMs,
    toggleSyncDrawer,
    copySyncDiagnostics,
  }
}

// 初始化一些东西，比如 onActivated / onDeactivated 
function init() {
  onMounted(() => {
    cleanupActivityListeners = setupActivityListeners()
  })

  onUnmounted(() => {
    cleanupActivityListeners?.()
  })

  onActivated(() => {
    enterRoom()
  })

  onDeactivated(() => {
    leaveRoom()
  })
}


// 进入房间
export async function enterRoom() {
  let roomId: string = route.params.roomId as string
  pageData.roomId = roomId
  pageData.state = 1
  pausedSec = 0

  let userData = ptUtil.getUserData()
  nickName = userData.nickName as string
  localId = userData.nonce as string
  
  let res = await request_enter(roomId, nickName, getClientState())
  enterResToErrState(res)
  if(!res) return
  let { code, data } = res
  if(code === "0000") {
    pageData.state = 2
    await nextTick()
    afterEnter(data as RoRes)
  }
}

function enterResToErrState(res?: RequestRes) {
  if(!res) {
    pageData.state = 13
    return
  }
  let { code } = res
  if(code === "0000") {
    return
  }
  else if(code === "E4004") {
    pageData.state = 12
  }
  else if(code === "E4006") {
    pageData.state = 11
  }
  else if(code === "E4003") {
    pageData.state = 14
  }
  else if(code === "R0001") {
    pageData.state = 15
  }
  else {
    pageData.state = 20
  }
}

// 成功进入房间后: 
//    赋值 / 创建播放器 / 开启 20s 轮询机制 / 建立 webSocket
function afterEnter(roRes: RoRes) {
  guestId = roRes?.guestId ?? ""
  pageData.content = roRes.content
  // 无播客的纯专注房间：先本地默认到 study，稍后 WS 的 MODE 会确认
  if(!roRes.content) pageData.activeMode = "study"
  pageData.amIOwner = roRes?.iamOwner === "Y" ? true : false
  updateParticipantsFromServer(roRes.participants, roRes.statusSeq ?? 0)
  pageData.notes = roRes.notes ? [...roRes.notes].sort((a, b) => a.position - b.position) : pageData.notes
  pageData.showMoreBox = handleShowMoreBox(roRes.content)
  updateInactiveListeners()

  createPlayer()
  heartbeat()
  connectWebSocket()
  shareData(roRes.content, roRes.playStatus, nickName)
}

// 创建播放器
function createPlayer() {
  let content = pageData.content
  if(player) {
    try {
      player.destroy()
    }
    catch(err) {}
    player = null
  }
  srcDuration = 0
  playStatus = "PAUSED"

  waitPlayer = new Promise((a: SimpleFunc) => {
    playerAlready = a
  })

  // 纯专注房间：没有播客，不建播放器，直接展示页面（进入 Study Mode）
  if(!content || !content.audioUrl) {
    showPage()
    return
  }

  const audio = {
    src: content.audioUrl,
    title: content.title,
    cover: content.imageUrl || images.APP_LOGO,
    artist: content.seriesName,
  }

  const durationchange = (duration?: number) => {
    if(duration) srcDuration = duration
    showPage()
  }
  const canplay = (e: Event) => {}
  const loadeddata = (e: Event) => {}

  const pause = (e: Event) => {
    playStatus = "PAUSED"
    if(isRemoteSetPaused) {
      isRemoteSetPaused = false
      return
    }
    collectLatestStatus()
  }
  const playing = (e: Event) => {
    pausedSec = 0
    playStatus = "PLAYING"
    pageData.needsPlaybackResume = false
    if(isRemoteSetPlaying) {
      isRemoteSetPlaying = false
      return
    }
    collectLatestStatus()
  }
  const ratechange = (e: Event) => {
    if(isRemoteSetSpeedRate) {
      isRemoteSetSpeedRate = false
      return
    }
    collectLatestStatus()
  }
  const seeked = (e: Event) => {
    if(isRemoteSetSeek) {
      isRemoteSetSeek = false
      return
    }
    collectLatestStatus()
  }
  const callbacks = {
    durationchange,
    canplay,
    loadeddata,
    pause,
    playing,
    ratechange,
    seeked
  }

  const onBeforeClick = (target: string): boolean => {
    if(pageData.amIOwner || !target) return true
    const list = ["play_or_pause", "forward", "backward", "speed", "seek"]
    const isRestricted = list.includes(target)
    if(pageData.everyoneCanOperatePlayer === "N" && isRestricted) {
      showOperateFailed()
      return false
    }
    return true
  }

  player = initPlayer(playerEl, audio, callbacks, onBeforeClick)
  checkPlayerReady()
}

let lastShowOperateFailed = 0
function showOperateFailed() {
  const now = time.getLocalTime()
  if(lastShowOperateFailed + 500 > now) return
  lastShowOperateFailed = now
  cui.showModal({
    title: "提示",
    content: "房主已设置仅房主能操作播放器。不过，你仍然可以调整是否静音（在\"...\"里）。",
    showCancel: false,
  })
}

// 开始检测 player 是否已经 ready
async function checkPlayerReady() {
  const cha = ptApi.getCharacteristic()
  if(!cha.isIOS && !cha.isIPadOS) {
    checkPlayerReadyAgain()
    return
  }
  await util.waitMilli(2000)
  if(srcDuration) return

  let res1 = await cui.showModal({
    title: "即将进入房间",
    content: "当前房间内可能正在播放中，是否进入？",
    cancelText: "离开",
    confirmText: "进入",
  })
  if(res1.cancel) {
    toHome()
    return
  }
  player.preloadForIOS()
  checkPlayerReadyAgain()
}

// 初始化播放器后再次检查播放器，是否加载到播放时长
async function checkPlayerReadyAgain() {
  await util.waitMilli(6000)
  if(pageData.state >= 3) return
  console.log("######## 等了 6s 无果，切换到未知的异常 ########")
  console.log(" ")
  pageData.state = 19
}

function showPage(): void {
  if(pageData.state <= 2) {
    pageData.state = 3
    playerAlready(true)
  }
}

/**
 * 可靠发送：socket 未就绪（iOS 杀死连接不触发 close / 重连握手中）时不再静默丢消息，
 * 而是暂存，等重连成功后补发；SET_PLAYER 则改为重新采集当前播放状态（避免补发旧位置）。
 */
function sendWs(obj: Record<string, any>): boolean {
  if(ws && ws.readyState === WebSocket.OPEN) {
    const ok = sendToWebSocket(ws, obj)
    if(ok) return true
  }
  const op = obj.operateType
  if(op === "SET_PLAYER") {
    pendingCollect = true
  }
  else if(op !== "HEARTBEAT" && op !== "FIRST_SEND") {
    if(pendingWsSends.length < 10) pendingWsSends.push(obj)
  }
  addSyncEvent(`ws not ready, queued ${op}`)
  // 只有在没有正在握手的连接时才发起重连，避免抖动
  if(!ws || ws.readyState >= WebSocket.CLOSING) connectWebSocket()
  return true
}

// 重连成功后补发暂存的消息
function flushPendingWs() {
  const list = pendingWsSends
  pendingWsSends = []
  for(const obj of list) {
    obj["x-pt-stamp"] = time.getTime()
    sendToWebSocket(ws, obj)
  }
  if(pendingCollect) {
    pendingCollect = false
    collectLatestStatus()
  }
}

// 收集最新状态，再用 ws 上报
function collectLatestStatus() {
  lastOperateLocalStamp = time.getLocalTime()
  if(timeoutCollect) clearTimeout(timeoutCollect)

  const _collect = () => {
    if(!player) return
    if(!pageData.amIOwner && pageData.everyoneCanOperatePlayer === "N") return

    const currentTime = player.currentTime ?? 0
    let contentStamp = currentTime * 1000
    contentStamp = util.numToFix(contentStamp, 0)
    let param: Record<string, any> = {
      operateType: "SET_PLAYER",
      roomId: pageData.roomId,
      "x-pt-local-id": localId,
      "x-pt-stamp": time.getTime(),
      playStatus,
      speedRate: String(player.playbackRate),
      contentStamp,
    }
    if(pageData.amIOwner) {
      param.everyoneCanOperatePlayer = pageData.everyoneCanOperatePlayer
    }
    // 暂停理由（摸鱼彩蛋）：仅在暂停时携带一次
    if(playStatus === "PAUSED" && pendingPauseReason) {
      param.reason = pendingPauseReason
    }
    pendingPauseReason = ""
    sendWs(param)
    checkOperated()
  }

  timeoutCollect = setTimeout(() => {
    _collect()
  }, COLLECT_TIMEOUT)
}

// 检查操作播放器 远端是否有收到
async function checkOperated() {
  await util.waitMilli(2500)
  const now = time.getLocalTime()
  const diff = now - lastNewStatusFromWsStamp
  console.log("检查操作播放器远端是否接收 时间差 (理想状态小于 2500):")
  console.log(diff)
  console.log(" ")
  if(diff < 3000) return

  // 没收到回声：连接多半已死。重连，并在连上后重新上报当前播放状态（补发操作）
  addSyncEvent("op echo missing, reconnect + resend")
  pendingCollect = true
  connectWebSocket()
}

// 每若干秒的心跳
function applyRoomSnapshot(roRes: RoRes, fromType: RevokeType = "http", protectRecent = true) {
  pageData.content = roRes.content
  updateParticipantsFromServer(roRes.participants, roRes.statusSeq ?? latestStatus?.statusSeq ?? 0)
  if(roRes.notes) pageData.notes = [...roRes.notes].sort((a, b) => a.position - b.position)
  updateInactiveListeners()

  const now = time.getLocalTime()
  const diff1 = now - lastOperateLocalStamp
  const diff2 = now - lastNewStatusFromWsStamp
  if(protectRecent && (diff1 < 900 || diff2 < 900)) return

  latestStatus = {
    roomId: roRes.roomId,
    playStatus: roRes.playStatus,
    speedRate: roRes.speedRate,
    operator: roRes.operator,
    contentStamp: roRes.contentStamp,
    operateStamp: roRes.operateStamp,
    statusSeq: roRes.statusSeq ?? 0,
  }
  if(roRes.everyoneCanOperatePlayer) {
    pageData.everyoneCanOperatePlayer = roRes.everyoneCanOperatePlayer
  }
  receiveNewStatus(fromType)
}

function heartbeat() {
  const _env = util.getEnv()
  heartbeatNum = 0
  lastHeartbeatStamp = 0

  const _closeRoom = (val: PageState, sendLeave: boolean = false) => {
    pageData.state = val
    leaveRoom(sendLeave)
  }

  const _newRoomStatus = (roRes: RoRes) => {
    applyRoomSnapshot(roRes, "http", true)
    return undefined
    pageData.content = roRes.content
    updateParticipantsFromServer(roRes.participants, roRes.statusSeq ?? latestStatus?.statusSeq ?? 0)

    const now = time.getLocalTime()
    const diff1 = now - lastOperateLocalStamp
    const diff2 = now - lastNewStatusFromWsStamp
    if(diff1 < 900) {
      console.log("刚刚 900ms 内本地有操作播放器")
      console.log("故不采纳心跳的 info")
      console.log(" ")
      return
    }
    if(diff2 < 900) {
      console.log("刚刚 900ms 内 web-socket 发来了最新状态")
      console.log("故不采纳心跳的 info")
      console.log(" ")
      return
    }

    latestStatus = {
      roomId: roRes.roomId,
      playStatus: roRes.playStatus,
      speedRate: roRes.speedRate,
      operator: roRes.operator,
      contentStamp: roRes.contentStamp,
      operateStamp: roRes.operateStamp,
      statusSeq: roRes.statusSeq ?? 0,
    }
    if(roRes.everyoneCanOperatePlayer) {
      pageData.everyoneCanOperatePlayer = roRes.everyoneCanOperatePlayer as "Y" | "N"
    }
    receiveNewStatus("http")
  }

  const _webSocketHb = () => {
    const send = {
      operateType: "HEARTBEAT",
      roomId: pageData.roomId,
      "x-pt-local-id": localId,
      "x-pt-stamp": time.getTime()
    }
    sendWs(send)
  }

  intervalHb = setInterval(async () => {

    // 心跳数有没有超过最大值
    heartbeatNum++
    if(heartbeatNum > MAX_HB_NUM) {
      _closeRoom(16, true)
      return
    }

    // 检查上一次心跳的时间，如果超过 35s
    // 就代表被浏览器限制定时了，执行 resume
    const now = time.getLocalTime()
    if(lastHeartbeatStamp > 0 && lastHeartbeatStamp + 35000 < now) {
      resume()
      return
    }
    lastHeartbeatStamp = now

    // 检查是否已暂停 5 分钟
    if(playStatus === "PAUSED") {
      pausedSec += _env.HEARTBEAT_PERIOD
      if(pausedSec >= (5 * 60)) {
        _closeRoom(17, true)
        return
      }
    }
    else pausedSec = 0

    // WS 看门狗：活连接每 15s 至少有一条服务端消息（心跳回声）。
    // 长时间静默 = 连接已死但没触发 close（iOS 切后台/切网络的典型表现）→ 主动重连。
    if(lastWsMsgStamp > 0 && now - lastWsMsgStamp > 40000) {
      addSyncEvent("ws silent >40s, watchdog reconnect")
      connectWebSocket()
    }

    const res = await request_heartbeat(pageData.roomId, nickName, getClientState())
    if(!res) return
    const { code, data } = res
    if(code === "0000") {
      _newRoomStatus(data as RoRes)
      _webSocketHb()
    }
    else if(code === "E4004") _closeRoom(12, false)
    else if(code === "E4006") _closeRoom(11, false)
    else if(code === "E4003") syncRoomNow(true)

  }, _env.HEARTBEAT_PERIOD * 1000)
}

// 用户息屏后、再打开，可能在这之间的定时器被浏览器限制了
// 没有了最新状态，所以进行恢复
async function resume() {
  console.log("执行 resume......................")
  console.log(" ")
  pausedSec = 0

  // 销毁心跳
  if(intervalHb) clearInterval(intervalHb)
  intervalHb = 0

  cui.showLoading({ title: "请稍等.." })

  // 关闭 web-socket
  if(ws) {
    try {
      ws.close()
    }
    catch(err) {}
    await util.waitMilli(500)
  }
  let res = await request_enter(pageData.roomId, nickName, getClientState())
  console.log("重新进入房间的结果..........")
  console.log(res)
  console.log(" ")
  cui.hideLoading()
  enterResToErrState(res)
  if(!res || res.code !== "0000") {
    leaveRoom()
    return
  }
  let roRes = res.data as RoRes
  guestId = roRes.guestId ?? ""
  applyRoomSnapshot(roRes, "http", false)
  heartbeat()
  connectWebSocket()
}

// 使用 web-socket 去建立连接
function connectWebSocket() {
  receiveWsNum = 0
  if(ws && ws.readyState < WebSocket.CLOSING) {
    try { ws.close() } catch(err) {}
  }

  const onmessage = (msgRes: WsMsgRes) => {
    receiveWsNum++
    lastWsMsgStamp = time.getLocalTime()
    const { responseType: rT, roomStatus } = msgRes

    // 刚连接
    if(rT === "CONNECTED") {
      addSyncEvent("ws connected")
      firstSend()
      flushPendingWs()
    }
    else if(rT === "NEW_STATUS" && roomStatus) {
      // console.log("web-socket 收到新的的状态.......")
      // console.log(msgRes)
      // console.log(" ")
      lastNewStatusFromWsStamp = time.getLocalTime()
      latestStatus = roomStatus
      addSyncEvent(`received NEW_STATUS #${roomStatus.statusSeq ?? 0} ${roomStatus.playStatus}`)
      if(msgRes.participants) {
        updateParticipantsFromServer(msgRes.participants, roomStatus.statusSeq ?? 0)
      }
      if(roomStatus.everyoneCanOperatePlayer) {
        pageData.everyoneCanOperatePlayer = roomStatus.everyoneCanOperatePlayer
      }
      if(roomStatus.playStatus === "PAUSED" && roomStatus.reason) {
        showPauseNotice(roomStatus.operator, roomStatus.reason)
      }
      else if(roomStatus.playStatus === "PLAYING") {
        pageData.pauseNotice = ""
      }
      receiveNewStatus()
    }
    else if(rT === "HEARTBEAT") {
      console.log("收到 ws 的HEARTBEAT.......")
      console.log(" ")
    }
    else if(rT === "PLAYER_ACKS" && msgRes.participants) {
      addSyncEvent("received PLAYER_ACKS")
      updateParticipantsFromServer(msgRes.participants, latestStatus?.statusSeq ?? 0)
    }
    else if(rT === "REACTION" && msgRes.reaction) {
      pushReaction(msgRes.reaction.emoji, msgRes.reaction.nickName)
    }
    else if(rT === "NOTE" && msgRes.note) {
      mergeNote(msgRes.note)
    }
    else if(rT === "NOTES" && msgRes.notes) {
      pageData.notes = [...msgRes.notes].sort((a, b) => a.position - b.position)
    }
    else if(rT === "NEW_CONTENT" && msgRes.content && msgRes.roomStatus) {
      if(msgRes.participants) updateParticipantsFromServer(msgRes.participants, msgRes.roomStatus.statusSeq ?? 0)
      receiveNewContent(msgRes.content, msgRes.roomStatus, msgRes.notes ?? [])
    }
    else if(rT === "STUDY_STATE" && msgRes.study) {
      pageData.study = msgRes.study
    }
    else if(rT === "MODE" && msgRes.mode) {
      pageData.activeMode = msgRes.mode
    }
  }

  const onclose = (closeEvent: CloseEvent) => {
    const { code } = closeEvent
    const now = time.getLocalTime()
    addSyncEvent(`ws closed ${code}`)

    // 监听关闭的状态码，1006 为非预期的情况
    // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
    if(code === 1006) {
      // 做一个防抖节流
      if(lastReConnectWs + 5000 > now) return
      lastReConnectWs = now
      lastHeartbeatStamp = now
      addSyncEvent("ws reconnecting")
      connectWebSocket()
    }
  }

  const onerror = () => addSyncEvent("ws error")

  const callbacks = {
    onmessage,
    onclose,
    onerror,
  }
  ws = initWebSocket(callbacks, pageData.roomId)
  // 新连接握手也算“活动”，给看门狗一个完整的宽限期
  lastWsMsgStamp = time.getLocalTime()
  checkWebSocket(++wsGen)
}

// 等待 5s 查看 web-socket 是否连接（gen 守卫：只有最新一次连接的检查生效）
async function checkWebSocket(gen: number) {
  await util.waitMilli(5000)
  if(gen !== wsGen) return
  if(receiveWsNum < 2) {
    syncRoomNow(true)
  }
}

// "首次发送" 给 websocket
function firstSend() {
  const send = {
    operateType: "FIRST_SEND",
    roomId: pageData.roomId,
    "x-pt-local-id": localId,
    "x-pt-stamp": time.getTime()
  }
  sendToWebSocket(ws, send)
}

async function receiveNewStatus(fromType: RevokeType = "ws") {
  if(latestStatus.roomId !== pageData.roomId) return
  updateInactiveListeners()

  await waitPlayer
  if(!player) {
    sendPlayerAck(false, "player_not_ready")
    return
  }
  let { contentStamp } = latestStatus

  // 判断时间
  let reSeekSec = playerTool.getReSeek(latestStatus, srcDuration, player.currentTime, fromType)
  if(reSeekSec >= 0) {
    isRemoteSetSeek = true
    player.seek(reSeekSec)
    addSyncEvent(`local seek correction to ${Math.floor(reSeekSec)}s`)
    checkSeek()
  }

  // 判断倍速
  let rSpeedRate = latestStatus.speedRate
  let speedRate = String(player.playbackRate)

  if(rSpeedRate !== speedRate) {
    console.log("播放器倍速不一致，请求调整......")
    isRemoteSetSpeedRate = true
    let speedRateNum = Number(rSpeedRate)
    player.playbackRate = speedRateNum
  }

  // 判断播放状态
  let rPlayStatus = latestStatus.playStatus
  let diff2 = (srcDuration * 1000) - contentStamp
  if(rPlayStatus !== playStatus) {
    // 如果剩下 1s 就结束了 还要播放，进行阻挡
    if(rPlayStatus === "PLAYING" && diff2 < 1000) {
      sendPlayerAck(false, "unknown")
      return
    }
    if(rPlayStatus === "PLAYING" && !isShowingAutoPlayPolicy) {
      console.log("远端请求播放......")
      isRemoteSetPlaying = true
      try {
        const result = player.play()
        if(result?.catch) await result
      }
      catch(err) {
        isRemoteSetPlaying = false
        pageData.needsPlaybackResume = true
        sendPlayerAck(false, "autoplay")
        addSyncEvent("autoplay blocked")
        console.log("播放失败.....")
        console.log(err)
        return
      }
      checkIsPlaying()
    }
    else if(rPlayStatus === "PAUSED") {
      console.log("远端请求暂停......")
      isRemoteSetPaused = true
      player.pause()
    }
  }
  sendPlayerAck(true)
}

// 由于 iOS 初始化时设置时间点 会不起作用
// 所以重新做检查
async function checkSeek() {
  await util.waitMilli(600)
  let reSeekSec = playerTool.getReSeek(latestStatus, srcDuration, player.currentTime, "check")
  if(reSeekSec >= 0) {
    isRemoteSetSeek = true
    player.seek(reSeekSec)
    addSyncEvent(`second seek correction to ${Math.floor(reSeekSec)}s`)
  }
}

async function checkIsPlaying() {
  await util.waitMilli(1500)
  const rPlayStatus = latestStatus.playStatus
  if(rPlayStatus === "PLAYING" && playStatus === "PAUSED") {
    pageData.needsPlaybackResume = true
    sendPlayerAck(false, "autoplay")
    addSyncEvent("playback still paused after remote play")
  }
}

async function handleAutoPlayPolicy() {
  if(isShowingAutoPlayPolicy) return

  isShowingAutoPlayPolicy = true
  let res1 = await cui.showModal({
    title: "当前房间正在播放",
    content: "🔇还是🔊？",
    cancelText: "静音",
    confirmText: "开声音"
  })
  isShowingAutoPlayPolicy = false

  // 如果是静音
  if(res1.cancel) {
    player.muted = true
  }

  // 调整进度条
  let reSeekSec = playerTool.getReSeek(latestStatus, srcDuration, player.currentTime, "check")
  if(reSeekSec >= 0) {
    isRemoteSetSeek = true
    player.seek(reSeekSec)
  }

  // 开始播放
  if(latestStatus.playStatus === "PLAYING") {
    isRemoteSetPlaying = true
    player.play()
  }
}


// 离开房间
async function leaveRoom(sendLeave: boolean = true) {
  // 销毁心跳
  if(intervalHb) clearInterval(intervalHb)
  intervalHb = 0

  // 关闭 web-socket
  if(ws) {
    ws.close()
  }

  // 销毁播放器
  if(player) {
    player.destroy()
    player = null
  }

  if(!sendLeave) return
  // 去发送离开房间的请求
  await request_leave(pageData.roomId, nickName)
}

function receiveNewContent(content: ContentData, roomStatus: RoomStatus, notes: PageData["notes"]) {
  pageData.content = content
  pageData.notes = notes
  pageData.showMoreBox = handleShowMoreBox(content)
  pageData.pauseNotice = ""
  latestStatus = roomStatus
  createPlayer()
  shareData(content, roomStatus.playStatus, nickName)
}
