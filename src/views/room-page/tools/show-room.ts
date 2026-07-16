import { ContentData, Participant } from "../../../type"
import { PageParticipant } from "../../../type/type-room-page"
import time from "../../../utils/time"
import util from "../../../utils/util"

export const showParticipants = (participants: Participant[], myGuestId: string, statusSeq: number = 0) => {
  let list: PageParticipant[] = []
  if(participants.length < 1) return list

  participants = participants.sort((a, b) => {
    return a.enterStamp - b.enterStamp
  })

  const now = time.getTime()
  list = participants.map(v => {
    let obj: PageParticipant = {
      guestId: v.guestId,
      nickName: v.nickName,
      enterStr: "",
      isMe: v.guestId === myGuestId,
      heartbeatStamp: v.heartbeatStamp,
      clientState: v.clientState,
      lastActiveStamp: v.lastActiveStamp,
      lastVisibleStamp: v.lastVisibleStamp,
      lastPlayerAck: v.lastPlayerAck,
      clientVersion: v.clientVersion,
    }
    obj.syncHealth = getSyncHealth(obj, statusSeq)
    obj.syncLabel = getSyncLabel(obj, statusSeq)
    const diff = now - v.enterStamp
    const sec = diff / 1000
    const min = sec / 60
    const hr = min / 60
    
    if(sec <= 60) obj.enterStr = `刚刚`
    else if(min >= 1 && min < 60) obj.enterStr = `` + Math.floor(min) + ` 分钟前`
    else if(hr < 2) obj.enterStr = `一小时前`
    else obj.enterStr = `两小时前`

    return obj
  })

  return list
}

function getSyncHealth(p: PageParticipant, statusSeq: number): PageParticipant["syncHealth"] {
  if(p.clientState === "hidden") return "hidden"
  if(p.clientState === "idle") return "idle"
  if(p.clientState === "reconnecting") return "reconnecting"
  const ack = p.lastPlayerAck
  if(ack && ack.statusSeq === statusSeq && ack.applied === false) return "needs_resume"
  if(statusSeq > 0 && (!ack || ack.statusSeq < statusSeq)) return "out_of_sync"
  return "online"
}

function getSyncLabel(p: PageParticipant, statusSeq: number): string {
  const ack = p.lastPlayerAck
  if(p.clientState === "hidden") return "后台中"
  if(p.clientState === "idle") return "离席中"
  if(p.clientState === "reconnecting") return "重连中"
  if(ack && ack.statusSeq === statusSeq && ack.applied === false) {
    if(ack.blockedReason === "autoplay") return "需要点一下继续"
    return "未应用同步"
  }
  if(statusSeq > 0 && (!ack || ack.statusSeq < statusSeq)) return "等待同步确认"
  if(ack?.localContentStamp !== undefined) return "已同步"
  return "在线"
}


/**
 * 是否要有“展示更多”的按钮
 * 策略: 潜在行数大于等于 5 行，肯定有该按钮，但在 3 行时就截断
 */
export const handleShowMoreBox = (content?: ContentData): boolean => {
  if(!content) return false
  const { title, description } = content
  if(!title || !description) return false

  // 获取可能的行数
  const rowNum = _getPotentialRow(description)
  if(rowNum < 5) return false
  return true
}


function _getPotentialRow(text: string): number {
  if(!text) return 0
  let list = text.split("\n")
  let rowNum = 0
  for(let i=0; i<list.length; i++) {
    rowNum++
    let rowText = list[i]

    if(rowText.length <= 18) continue
    let chineseNum = util.getChineseCharNum(rowText)
    let otherNum = rowText.length - chineseNum
    let scores = (chineseNum * 2) + otherNum
    rowNum += Math.floor(scores / 41)
  }
  return rowNum
}
