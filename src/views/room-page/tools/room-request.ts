import rq from "../../../request"
import { RequestRes, RoRes } from "../../../type"
import { ClientState } from "../../../type/type-room-page"
import api from "../../../request/api"

const url = api.ROOM_OPERATE

export const request_enter = async(
  roomId: string,
  nickName: string,
  clientState: ClientState = "visible",
): Promise<RequestRes<RoRes>> => {
  const param = { operateType: "ENTER", roomId, nickName, clientState }
  return rq.request<RoRes>(url, param)
}

export const request_heartbeat = async(
  roomId: string,
  nickName: string,
  clientState: ClientState = "visible",
): Promise<RequestRes<RoRes>> => {
  const param = { operateType: "HEARTBEAT", roomId, nickName, clientState }
  return rq.request<RoRes>(url, param)
}

export const request_leave = async(roomId: string, nickName: string): Promise<RequestRes<RoRes>> => {
  const param = { operateType: "LEAVE", roomId, nickName }
  return rq.request<RoRes>(url, param)
}
