import { ContentData } from "./index"

export type PageState = 1 | 2 | 3 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20
export type ClientState = "visible" | "hidden" | "idle" | "reconnecting"

export interface PageParticipant {
  guestId: string
  nickName: string
  enterStr: string
  isMe: boolean
  heartbeatStamp: number
  clientState?: ClientState
  lastActiveStamp?: number
  lastVisibleStamp?: number
}

export interface Reaction {
  id: number
  emoji: string
  nickName: string
}

export interface RoomNote {
  noteId: string
  position: number
  nickName: string
  guestId: string
  text: string
  createdAt: number
}

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
  startStamp: number
  elapsedMs: number
  durationMs: number
  completedFocusRounds: number
  operator: string
  operateStamp: number
  config: TimerConfig
}

export interface StudyState {
  timer: StudyTimer
  todos: Record<string, TodoItem[]>
  statuses: Record<string, StudyStatus>
}

export interface PageData {
  state: PageState
  roomId: string
  content?: ContentData
  participants: PageParticipant[]
  showMoreBox: boolean
  amIOwner: boolean
  everyoneCanOperatePlayer: "Y" | "N"
  reactions: Reaction[]
  notes: RoomNote[]
  pauseNotice: string
  needsPlaybackResume: boolean
  inactiveListeners: PageParticipant[]
  study?: StudyState
}

type SpeedRate = "0.8" | "1" | "1.2" | "1.5" | "1.7"

export type PlayStatus = "PLAYING" | "PAUSED"

export interface RoomStatus {
  roomId: string
  playStatus: PlayStatus
  speedRate: SpeedRate
  operator: string
  contentStamp: number
  operateStamp: number
  everyoneCanOperatePlayer?: "Y" | "N"
  reason?: string
  content?: ContentData
}

export interface WsReaction {
  emoji: string
  nickName: string
  guestId: string
  stamp: number
}

export interface WsMsgRes {
  responseType: "CONNECTED" | "NEW_STATUS" | "HEARTBEAT" | "REACTION" | "NOTE" | "NOTES" | "NEW_CONTENT" | "STUDY_STATE"
  roomStatus?: RoomStatus
  reaction?: WsReaction
  note?: RoomNote
  notes?: RoomNote[]
  content?: ContentData
  study?: StudyState
}

export type RevokeType = "ws" | "http" | "check"
