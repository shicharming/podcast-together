// Shared types for the podcast-together backend.
// Kept in sync with the frontend contract (src/type/index.ts + type-room-page.ts).

export interface ContentData {
  infoType: "podcast"
  audioUrl: string
  sourceType?: string
  title?: string
  description?: string
  imageUrl?: string
  linkUrl?: string
  seriesName?: string
  seriesUrl?: string
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

export type SpeedRate = "0.8" | "1" | "1.2" | "1.5" | "1.7"
export type PlayStatus = "PLAYING" | "PAUSED"
export type ClientState = "visible" | "hidden" | "idle" | "reconnecting"

// ---- Study Mode (shared Pomodoro + todos + manual status) ----
export type StudyStatus = "working" | "stuck" | "done" | "away" | "break"
export type TimerPhase = "focus" | "short_break" | "long_break"

export interface TodoItem {
  id: string
  text: string
  done: boolean
  createdAt: number
}

export interface TimerConfig {
  focusMs: number
  shortBreakMs: number
  longBreakMs: number
  roundsBeforeLong: number
}

export interface StudyTimer {
  phase: TimerPhase
  isRunning: boolean
  startStamp: number    // server ms when the current run segment started
  elapsedMs: number     // accumulated elapsed in this phase before the current run
  durationMs: number    // full length of the current phase
  completedFocusRounds: number
  operator: string      // last operator guestId
  operateStamp: number
  config: TimerConfig
}

export interface StudyState {
  timer: StudyTimer
  todos: Record<string, TodoItem[]>       // keyed by guestId
  statuses: Record<string, StudyStatus>   // keyed by guestId
}

export interface Participant {
  nickName: string
  enterStamp: number
  heartbeatStamp: number
  userAgent?: string
  guestId: string
  nonce: string
  clientState?: ClientState
  lastActiveStamp?: number
  lastVisibleStamp?: number
}

export interface ParticipantClient {
  nickName: string
  guestId: string
  heartbeatStamp: number
  enterStamp: number
  clientState?: ClientState
  lastActiveStamp?: number
  lastVisibleStamp?: number
}

// Timestamp note (formerly "笔记"): a shared bookmark at a playback position + short text.
export interface Note {
  noteId: string
  position: number // playback position in ms (contentStamp)
  nickName: string
  guestId: string
  text: string
  createdAt: number
}

export interface RoomConfig {
  everyoneCanOperatePlayer: "Y" | "N"
}

export interface Room {
  roomId: string
  content?: ContentData   // optional: a pure focus room has no podcast
  oState: "OK" | "EXPIRED" | "DELETED"
  playStatus: PlayStatus
  speedRate: SpeedRate
  contentStamp: number
  operateStamp: number
  operator: string
  pauseReason?: string
  createStamp: number
  expiresAt: number
  owner: string
  participants: Participant[]
  notes: Note[]
  config: RoomConfig
  study: StudyState
}

export interface RoRes {
  roomId: string
  content?: ContentData
  playStatus: PlayStatus
  speedRate: SpeedRate
  operator: string
  contentStamp: number
  operateStamp: number
  participants: ParticipantClient[]
  guestId?: string
  iamOwner?: "Y" | "N"
  everyoneCanOperatePlayer?: "Y" | "N"
  notes?: Note[]
  study?: StudyState
}

export interface ResType<T = RoRes> {
  code: string
  errMsg?: string
  showMsg?: string
  data?: T
}

export interface Env {
  ROOM: DurableObjectNamespace
}
