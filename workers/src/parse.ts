// Podcast link parser — reimplementation of cloud-functions/src/parse-text.ts
// on Cloudflare Workers. Uses regex + OpenGraph meta extraction (no cheerio),
// which covers the MVP link types: xiaoyuzhou, Apple Podcasts regional links, direct mp3/m4a.

import type { ContentData, ResType, TranscriptRef } from "./types"

const MAX_FETCH_MILLI = 8000
const WX_AUDIO_URL = "https://res.wx.qq.com/voice/getvoice?mediaid="
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"

export async function handleParse(body: Record<string, any>): Promise<ResType<ContentData>> {
  const link: string = body?.link
  const clientId: string = body?.["x-pt-local-id"]
  if (!link || !clientId) return { code: "E4000" }
  if (link.indexOf("http") !== 0) return { code: "E4000" }

  // Direct CDN audio link — no fetch needed.
  if (judgeIsCdnLink(link)) {
    return { code: "0000", data: { infoType: "podcast", audioUrl: link } }
  }

  // Apple Podcasts pages no longer embed a scrapeable audio URL in their
  // server-rendered HTML (Apple reworked the web player around the Feb/Mar
  // 2026 Podcasts redesign), so regex-scraping the page for a bare .mp3/.m4a
  // link — which used to work — now reliably misses. Apple's public iTunes
  // Lookup API still exposes the real enclosure URL per episode, so we hit
  // that first for podcasts.apple.com links and only fall back to HTML
  // scraping (still useful for non-Apple links, or if Apple ever changes
  // the Lookup API) when it doesn't resolve.
  if (link.includes("podcasts.apple.com")) {
    const appleData = await getAppleEpisodeViaLookup(link)
    if (appleData) {
      appleData.transcripts = await discoverTranscripts(appleData, "", link)
      return { code: "0000", data: appleData }
    }
  }

  const html = await fetchLink(link)
  if (!html) return { code: "E4004" }
  const parsed = parseHtml(html, link)
  if (parsed.code === "0000" && parsed.data) {
    parsed.data.transcripts = await discoverTranscripts(parsed.data, html, link)
  }
  return parsed
}

// Resolve an Apple Podcasts link (show + optional ?i=<episodeId>) straight
// through Apple's iTunes Lookup API instead of scraping podcasts.apple.com.
// Returns null when there's no episode id to resolve, or when the episode
// isn't among the show's most recent 200 entries — callers should fall back
// to HTML scraping in that case.
async function getAppleEpisodeViaLookup(link: string): Promise<ContentData | null> {
  const collectionId = link.match(/\/id(\d+)/)?.[1]
  const episodeId = link.match(/[?&]i=(\d+)/)?.[1]
  if (!collectionId || !episodeId) return null

  const body = await fetchText(
    `https://itunes.apple.com/lookup?id=${collectionId}&entity=podcastEpisode&limit=200`,
    "application/json",
  )
  if (!body) return null

  let results: any[] = []
  try {
    results = JSON.parse(body)?.results ?? []
  } catch {
    return null
  }

  const show = results.find((r) => r?.wrapperType === "track")
  const episode = results.find((r) => String(r?.trackId ?? "") === episodeId)
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

function judgeIsCdnLink(link: string): boolean {
  const reg = /^http(s)?:\/\/[\w.-]*\w{1,32}\.\w{2,6}\/\S+\.(mp3|m4a)([?=\w]*)?$/i
  return reg.test(link)
}

async function fetchLink(link: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MAX_FETCH_MILLI)
  try {
    const res = await fetch(link, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
      signal: controller.signal,
      redirect: "follow",
    })
    if (!res.ok) {
      console.log(`fetchLink ${res.status} ${link}`)
      return ""
    }
    const html = await res.text()
    const lower = html.toLowerCase()
    if (!lower.includes("head") || !lower.includes("meta")) return ""
    return html
  } catch {
    return ""
  } finally {
    clearTimeout(timer)
  }
}

// Read a single attribute value out of one raw HTML tag string.
function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))
  if (!m) return ""
  return (m[2] ?? m[3] ?? "").trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
}

function normalizeText(s?: string): string {
  return decodeEntities(s ?? "")
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
}

function absolutizeUrl(url: string, base: string): string {
  try {
    return new URL(decodeEntities(url), base).toString()
  } catch {
    return decodeEntities(url)
  }
}

function parseHtml(html: string, originLink: string): ResType<ContentData> {
  let appName = ""
  let sourceType = ""
  let title = ""
  let audioUrl = ""
  let description = ""
  let imageUrl = ""
  let twitterImage = ""
  let linkUrl = ""
  let seriesName = ""
  let seriesUrl = ""

  const isMp = originLink.includes("mp.weixin.qq.com")

  // Walk every <meta> tag.
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0]
    const property = attr(tag, "property")
    const nameAttr = attr(tag, "name")
    const content = attr(tag, "content")
    if (!content && property !== "og:image") continue

    if (property === "og:title") title = content
    else if (property === "og:description" || property === "description") description = content
    else if (property === "og:image") imageUrl = content
    else if (property === "og:audio") audioUrl = content
    else if (nameAttr === "application-name") appName = content
    else if (property === "twitter:image") twitterImage = content
    else if (property === "og:url") linkUrl = content
    else if (property === "og:site_name" && !appName) appName = content
  }

  if (!audioUrl) {
    audioUrl = getAudioUrl(html, { isMp })
    if (!audioUrl) return { code: "E4004" }
  }

  if (!imageUrl && twitterImage) imageUrl = twitterImage
  if (!title) {
    const hd = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (hd) title = decodeEntities(hd[1].trim())
  }

  // Structured podcast metadata carried in <script name="schema:...">JSON</script>.
  for (const s of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const scriptAttrs = s[1]
    const inner = s[2]
    const sName = attr(scriptAttrs, "name")
    if (sName === "schema:podcast-show") {
      const j = safeJson(inner)
      if (j?.url) linkUrl = j.url
      const series = j?.partOfSeries ?? {}
      seriesName = series.name ?? seriesName
      seriesUrl = series.url ?? seriesUrl
      if (j?.description) description = j.description
    } else if (sName === "schema:podcast-episode") {
      // Apple Podcasts
      const j = safeJson(inner)
      if (j?.name) title = j.name
      if (j?.description) description = j.description
      if (j?.isPartOf) seriesName = typeof j.isPartOf === "string" ? j.isPartOf : (j.isPartOf?.name ?? seriesName)
    }
  }

  if (isMp) {
    sourceType = "weixin_mp"
    imageUrl = "" // WeChat images are hotlink-protected
    const mMp = html.match(/class="profile_nickname">\s*([\s\S]*?)\s*<\/strong>/)
    if (mMp) seriesName = mMp[1].trim()
  }

  if (!linkUrl) linkUrl = originLink

  if (appName === "小宇宙") sourceType = "xiaoyuzhou"
  else if (appName === "一派·Podcast") {
    sourceType = "sspai"
    if (!seriesName) seriesName = "一派·Podcast"
    if (!seriesUrl) seriesUrl = "https://sspai.typlog.io/"
  } else if (linkUrl.includes("podcasts.apple.com")) sourceType = "apple_podcast"
  else if (appName && !seriesName) seriesName = appName

  return {
    code: "0000",
    data: {
      infoType: "podcast",
      title: decodeEntities(title),
      audioUrl,
      description: decodeEntities(description),
      imageUrl,
      linkUrl,
      sourceType,
      seriesName: decodeEntities(seriesName),
      seriesUrl,
    },
  }
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function getAudioUrl(html: string, opt: { isMp: boolean }): string {
  // mp3/m4a with query string
  const reg0 = /http(s)?:\/\/[^\s/"']{2,40}\/[^\s"']{2,240}\.(mp3|m4a)\?[^\s/"']{3,240}/g
  for (const m of html.matchAll(reg0)) return m[0]

  // bare mp3/m4a
  const reg1 = /http(s)?:\/\/[^\s/"']{2,40}\/[^\s"']{2,240}\.(mp3|m4a)/g
  for (const m of html.matchAll(reg1)) return m[0]

  if (!opt.isMp) return ""

  const reg2 = /"voice_id":"(\w{10,50})"/g
  for (const m of html.matchAll(reg2)) return WX_AUDIO_URL + m[1]
  const reg3 = /'voice_id':'(\w{10,50})'/g
  for (const m of html.matchAll(reg3)) return WX_AUDIO_URL + m[1]

  return ""
}

async function discoverTranscripts(content: ContentData, html: string, originLink: string): Promise<TranscriptRef[]> {
  const feedUrls = new Set<string>()
  const appleFeed = await getAppleFeedUrl(originLink)
  if (appleFeed) feedUrls.add(appleFeed)

  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]
    const rel = attr(tag, "rel").toLowerCase()
    const type = attr(tag, "type").toLowerCase()
    const href = attr(tag, "href")
    if (!href) continue
    const isFeed = rel.includes("alternate") && (type.includes("rss") || type.includes("atom") || type.includes("xml"))
    if (isFeed) feedUrls.add(absolutizeUrl(href, originLink))
  }

  for (const feedUrl of feedUrls) {
    const rss = await fetchText(feedUrl, "application/rss+xml,application/xml,text/xml,*/*")
    if (!rss) continue
    const transcripts = findEpisodeTranscripts(rss, content, feedUrl)
    if (transcripts.length) return sortTranscripts(transcripts)
  }
  return []
}

async function getAppleFeedUrl(link: string): Promise<string> {
  const id = link.match(/\/id(\d+)/)?.[1]
  if (!id) return ""
  const body = await fetchText(`https://itunes.apple.com/lookup?id=${id}&entity=podcast`, "application/json")
  if (!body) return ""
  try {
    const json = JSON.parse(body)
    const feedUrl = json?.results?.[0]?.feedUrl
    return typeof feedUrl === "string" ? feedUrl : ""
  } catch {
    return ""
  }
}

async function fetchText(url: string, accept: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MAX_FETCH_MILLI)
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, "Accept": accept },
      redirect: "follow",
      signal: controller.signal,
    })
    if (!res.ok) {
      console.log(`fetchText ${res.status} ${url}`)
      return ""
    }
    const len = Number(res.headers.get("content-length") || "0")
    if (len > 2_000_000) return ""
    return await res.text()
  } catch {
    return ""
  } finally {
    clearTimeout(timer)
  }
}

function findEpisodeTranscripts(rss: string, content: ContentData, feedUrl: string): TranscriptRef[] {
  const items = [...rss.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0])
  if (!items.length) return []
  const item = items.find((v) => isMatchingItem(v, content))
  if (!item) return []

  const refs: TranscriptRef[] = []
  for (const m of item.matchAll(/<podcast:transcript\b[^>]*>/gi)) {
    const tag = m[0]
    const url = attr(tag, "url")
    const type = attr(tag, "type")
    if (!url || !type) continue
    refs.push({
      url: absolutizeUrl(url, feedUrl),
      type: decodeEntities(type),
      language: decodeEntities(attr(tag, "language")),
      rel: decodeEntities(attr(tag, "rel")),
    })
  }
  return refs
}

function isMatchingItem(item: string, content: ContentData): boolean {
  const enclosure = item.match(/<enclosure\b[^>]*>/i)?.[0] ?? ""
  const enclosureUrl = attr(enclosure, "url")
  if (enclosureUrl && content.audioUrl && decodeEntities(enclosureUrl) === content.audioUrl) return true

  const link = textTag(item, "link")
  const guid = textTag(item, "guid")
  if (content.linkUrl && (link === content.linkUrl || guid === content.linkUrl)) return true

  const itemTitle = normalizeText(textTag(item, "title"))
  const contentTitle = normalizeText(content.title)
  return Boolean(itemTitle && contentTitle && itemTitle === contentTitle)
}

function textTag(xml: string, tagName: string): string {
  const m = xml.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"))
  if (!m) return ""
  return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim())
}

function sortTranscripts(refs: TranscriptRef[]): TranscriptRef[] {
  const score = (type: string) => {
    const t = type.toLowerCase()
    if (t.includes("vtt")) return 0
    if (t.includes("subrip") || t.includes("srt")) return 1
    if (t.includes("json")) return 2
    if (t.includes("text")) return 3
    return 4
  }
  return [...refs].sort((a, b) => score(a.type) - score(b.type))
}
