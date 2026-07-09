import rq from "../../request"
import { RequestRes, RoRes, ContentData, TranscriptCue, TranscriptRef } from "../../type"
import api from "../../request/api"
import ptUtil from "../../utils/pt-util"

export const request_parse = async (link: string): Promise<RequestRes<ContentData>> => {
  const url = api.PARSE_TEXT
  const res = await rq.request<ContentData>(url, { link })
  return res
}

export const request_create = async (roomData?: ContentData): Promise<RequestRes<RoRes>> => {
  const url = api.ROOM_OPERATE
  let userData = ptUtil.getUserData()
  // roomData 省略时创建一个无播客的纯专注房间（JSON 会自动丢弃 undefined 字段）
  const param = {
    operateType: "CREATE",
    roomData,
    nickName: userData.nickName,
  }
  const res = await rq.request<RoRes>(url, param)
  return res
}

export const request_parse_transcript = async (transcript: TranscriptRef): Promise<RequestRes<{ cues: TranscriptCue[] }>> => {
  const url = api.PARSE_TRANSCRIPT
  const res = await rq.request<{ cues: TranscriptCue[] }>(url, { url: transcript.url, type: transcript.type })
  return res
}
