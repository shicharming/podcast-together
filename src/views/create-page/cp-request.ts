import rq from "../../request"
import { RequestRes, RoRes, ContentData, TranscriptCue, TranscriptRef } from "../../type"
import api from "../../request/api"
import ptUtil from "../../utils/pt-util"

// Apple 会对 Cloudflare Workers 的出口 IP 返回 403，worker 端解析不了 Apple 链接。
// iTunes Lookup API 不带 CORS 头但支持 JSONP，所以 Apple 链接改在浏览器端（用户
// 的住宅 IP）解析；拿不到结果时仍回退 worker 的 /parse-text。
const jsonp = (url: string, timeoutMs = 8000): Promise<any> => new Promise((resolve) => {
  const cb = "__pt_jsonp_" + Date.now() + "_" + Math.floor(Math.random() * 1e6)
  const s = document.createElement("script")
  const done = (data: any) => {
    delete (window as any)[cb]
    s.remove()
    resolve(data)
  }
  ;(window as any)[cb] = done
  s.onerror = () => done(null)
  setTimeout(() => done(null), timeoutMs)
  s.src = url + "&callback=" + cb
  document.head.appendChild(s)
})

const parseAppleLink = async (link: string): Promise<ContentData | null> => {
  if (!link.includes("podcasts.apple.com")) return null
  const collectionId = link.match(/\/id(\d+)/)?.[1]
  const episodeId = link.match(/[?&]i=(\d+)/)?.[1]
  if (!collectionId || !episodeId) return null
  const res = await jsonp(`https://itunes.apple.com/lookup?id=${collectionId}&entity=podcastEpisode&limit=200`)
  const results: any[] = res?.results ?? []
  const show = results.find((r) => r?.wrapperType === "track")
  const episode = results.find((r) => String(r?.trackId ?? "") === episodeId)
  // ponytail: lookup 只返回最近 200 集，更早的集数会走 worker 回退（目前也解析不了，
  // 升级路径是经 feedUrl 拉 RSS 再按标题匹配）
  if (!episode?.episodeUrl) return null
  return {
    infoType: "podcast",
    audioUrl: episode.episodeUrl,
    title: episode.trackName ?? "",
    description: episode.description ?? episode.shortDescription ?? "",
    imageUrl: episode.artworkUrl600 ?? show?.artworkUrl600 ?? "",
    linkUrl: link,
    sourceType: "apple_podcast",
    seriesName: show?.collectionName ?? episode.collectionName ?? "",
    seriesUrl: show?.collectionViewUrl ?? "",
  }
}

export const request_parse = async (link: string): Promise<RequestRes<ContentData>> => {
  const appleData = await parseAppleLink(link)
  if (appleData) return { code: "0000", data: appleData }
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
