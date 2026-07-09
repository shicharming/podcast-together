import type { ResType, TranscriptCue } from "./types"

const MAX_TRANSCRIPT_BYTES = 1_500_000
const MAX_FETCH_MILLI = 8000
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36"

export async function handleParseTranscript(body: Record<string, any>): Promise<ResType<{ cues: TranscriptCue[] }>> {
  const url = String(body?.url ?? "")
  const type = String(body?.type ?? "")
  if (!url || !type || !/^https?:\/\//i.test(url)) return { code: "E4000" }

  const text = await fetchTranscript(url)
  if (!text) return { code: "E4004" }

  const lowerType = type.toLowerCase()
  let cues: TranscriptCue[] = []
  if (lowerType.includes("vtt")) cues = parseVtt(text)
  else if (lowerType.includes("subrip") || lowerType.includes("srt")) cues = parseSrt(text)
  else if (lowerType.includes("json")) cues = parseJsonTranscript(text)
  else cues = []

  return { code: "0000", data: { cues: normalizeCues(cues) } }
}

async function fetchTranscript(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), MAX_FETCH_MILLI)
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": UA, "Accept": "text/vtt,application/x-subrip,application/json,text/plain,*/*" },
      redirect: "follow",
      signal: controller.signal,
    })
    if (!res.ok) return ""
    const len = Number(res.headers.get("content-length") || "0")
    if (len > MAX_TRANSCRIPT_BYTES) return ""
    const text = await res.text()
    if (new TextEncoder().encode(text).length > MAX_TRANSCRIPT_BYTES) return ""
    return text
  } catch {
    return ""
  } finally {
    clearTimeout(timer)
  }
}

function parseVtt(text: string): TranscriptCue[] {
  const cleaned = text.replace(/^\uFEFF/, "").replace(/\r/g, "")
  const blocks = cleaned.split(/\n{2,}/)
  const cues: TranscriptCue[] = []
  for (const block of blocks) {
    const lines = block.split("\n").map((v) => v.trim()).filter(Boolean)
    const timeIdx = lines.findIndex((v) => v.includes("-->"))
    if (timeIdx < 0) continue
    const [startRaw, endRaw] = lines[timeIdx].split("-->").map((v) => v.trim().split(/\s+/)[0])
    const startMs = parseTime(startRaw)
    const endMs = parseTime(endRaw)
    const cueText = lines.slice(timeIdx + 1).join(" ").replace(/<[^>]*>/g, "").trim()
    if (startMs >= 0 && endMs > startMs && cueText) cues.push({ startMs, endMs, text: cueText })
  }
  return cues
}

function parseSrt(text: string): TranscriptCue[] {
  return parseVtt(text.replace(/,/g, "."))
}

function parseJsonTranscript(text: string): TranscriptCue[] {
  try {
    const data = JSON.parse(text)
    const rows = Array.isArray(data) ? data : Array.isArray(data?.segments) ? data.segments : Array.isArray(data?.transcript) ? data.transcript : []
    const cues: TranscriptCue[] = []
    for (const row of rows) {
      const start = firstNumber(row, ["startMs", "start_ms", "startTimeMs", "start_time_ms"])
      const end = firstNumber(row, ["endMs", "end_ms", "endTimeMs", "end_time_ms"])
      const startSec = firstNumber(row, ["start", "startTime", "start_time"])
      const endSec = firstNumber(row, ["end", "endTime", "end_time"])
      const startMs = start >= 0 ? start : startSec >= 0 ? startSec * 1000 : -1
      const endMs = end >= 0 ? end : endSec >= 0 ? endSec * 1000 : -1
      const body = String(row?.text ?? row?.body ?? row?.transcript ?? row?.content ?? "").trim()
      if (startMs >= 0 && endMs > startMs && body) cues.push({ startMs, endMs, text: body })
    }
    return cues
  } catch {
    return []
  }
}

function firstNumber(row: any, keys: string[]): number {
  for (const key of keys) {
    const value = Number(row?.[key])
    if (!Number.isNaN(value)) return value
  }
  return -1
}

function parseTime(value: string): number {
  const clean = value.trim().replace(",", ".")
  const parts = clean.split(":")
  if (parts.length < 2 || parts.length > 3) return -1
  const sec = Number(parts.pop())
  const min = Number(parts.pop())
  const hour = parts.length ? Number(parts.pop()) : 0
  if ([sec, min, hour].some((v) => Number.isNaN(v))) return -1
  return Math.round(((hour * 3600) + (min * 60) + sec) * 1000)
}

function normalizeCues(cues: TranscriptCue[]): TranscriptCue[] {
  return cues
    .filter((v) => v.startMs >= 0 && v.endMs > v.startMs && v.text.trim())
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, 5000)
}
