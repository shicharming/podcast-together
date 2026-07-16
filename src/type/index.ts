
/**************** 网络请求 **************/
// 请求回调的公共入参
export interface RequestParam {
  "x-pt-version": string
  "x-pt-client": string
  "x-pt-stamp": number
  "x-pt-language": string
  "x-pt-local-id": string
  [otherParam: string]: any
}

// 请求回调的结果
export interface RequestRes<T = Record<string, any>> {
  code: string
  errMsg?: string
  showMsg?: string
  data?: T
}

/**************** 一些正常情况下的返回参数 *************/
export interface Participant {
  nickName: string
  guestId: string
  heartbeatStamp: number
  enterStamp: number
  clientState?: "visible" | "hidden" | "idle" | "reconnecting"
  lastActiveStamp?: number
  lastVisibleStamp?: number
  lastPlayerAck?: PlayerAck
  listening?: boolean
  clientVersion?: string
}

export interface PlayerAck {
  statusSeq: number
  applied: boolean
  playStatus?: "PLAYING" | "PAUSED"
  localContentStamp?: number
  blockedReason?: "autoplay" | "player_not_ready" | "permission" | "tab_hidden" | "unknown"
  receivedAt?: number
  appliedAt?: number
}

export interface ContentData {
  infoType: "podcast"
  audioUrl: string
  sourceType?: string
  title?: string
  description?: string
  imageUrl?: string
  linkUrl?: string
  seriesName?: string   // 播客专栏名称，比如 "商业就是这样"
  seriesUrl?: string    // 播客专栏链接
  transcripts?: TranscriptRef[]
}

export interface TranscriptRef {
  url: string
  type: string
  language?: string
  rel?: string
}

export interface TranscriptCue {
  startMs: number
  endMs: number
  text: string
}

export interface RoRes {
  roomId: string
  content: ContentData
  playStatus: "PLAYING" | "PAUSED"
  speedRate: "0.8" | "1" | "1.2" | "1.5" | "1.7"
  operator: string
  contentStamp: number
  operateStamp: number
  statusSeq: number
  participants: Participant[]
  guestId?: string
  iamOwner?: "Y" | "N"
  everyoneCanOperatePlayer?: "Y" | "N"
  notes?: any[]
}


/********************* 纯前端的类型 **********************/
export interface StorageUserData {
  nickName?: string
  nonce?: string
}

export interface EnvType {
  DEV: boolean
  WEBSOCKET_URL: string
  API_URL: string
  HEARTBEAT_PERIOD: number
  THIRD_PARTY_SETTING_URL?: string
  CONTACT_EMAIL?: string
  CONTACT_FEISHU?: string
  PLAUSIBLE_DOMAIN?: string
  PLAUSIBLE_SRC?: string
}
