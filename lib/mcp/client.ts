import { gmailFor } from "@/lib/google/gmail-client"
import { calendarFor } from "@/lib/google/calendar-client"
import {
  normalizeEmailSummary,
  normalizeEvent,
} from "@/lib/google/normalize"
import { computeFreeSlots } from "@/lib/google/free-time"
import { parseNatural, iso } from "@/mcp/shared/time"
import type {
  NormalizedEmailSummary,
  NormalizedEvent,
  FreeSlot,
} from "@/mcp/shared/types"

export type McpUserContext = {
  userId: string
  timeZone: string
  /** User's connected Google address; used to drop self-sent threads. */
  myEmail?: string
}

export type SourceStatus = "ok" | "disconnected" | "error"

export type SafeFetchResult<T> = {
  data: T
  status: SourceStatus
  error?: string
}

function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /not connected|reconnect|invalid_grant|auth_error|401|403/i.test(msg)
}

async function safe<T>(
  fn: () => Promise<T>,
  empty: T
): Promise<SafeFetchResult<T>> {
  try {
    return { data: await fn(), status: "ok" }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      data: empty,
      status: isAuthError(e) ? "disconnected" : "error",
      error: message,
    }
  }
}

function extractAddress(from: string): string {
  // "Name <addr@x>" → "addr@x"; falls back to the trimmed input.
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim().toLowerCase()
}

export async function getEmails(
  ctx: McpUserContext,
  opts?: { query?: string; maxResults?: number }
): Promise<SafeFetchResult<NormalizedEmailSummary[]>> {
  return safe(async () => {
    // Broaden default: 4 days, drop promotions/social/forums/updates noise.
    // -from:me drops drafts where the user is the only sender on a thread.
    const query =
      opts?.query ??
      "newer_than:4d -category:promotions -category:social -category:forums -in:chats"
    const maxResults = opts?.maxResults ?? 25
    const gmail = await gmailFor(ctx.userId)

    const list = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults,
    })
    const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean)
    if (ids.length === 0) return []

    const fetched = await Promise.all(
      ids.map((id) =>
        gmail.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "To", "Subject", "Date"],
        })
      )
    )
    const normalized = fetched.map((r) => normalizeEmailSummary(r.data))

    // Dedupe by threadId: keep the latest message per thread.
    const latestPerThread = new Map<string, NormalizedEmailSummary>()
    for (const m of normalized) {
      const cur = latestPerThread.get(m.threadId)
      if (!cur || new Date(m.date).getTime() > new Date(cur.date).getTime()) {
        latestPerThread.set(m.threadId, m)
      }
    }

    // Drop threads whose latest message is from the user (i.e. already replied).
    const myAddr = ctx.myEmail?.toLowerCase()
    const result: NormalizedEmailSummary[] = []
    for (const m of latestPerThread.values()) {
      if (myAddr && extractAddress(m.from) === myAddr) continue
      result.push(m)
    }
    // Newest first.
    result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    return result
  }, [])
}

export async function getCalendarEvents(
  ctx: McpUserContext,
  opts?: { timeMin?: string; timeMax?: string; maxResults?: number }
): Promise<SafeFetchResult<NormalizedEvent[]>> {
  return safe(async () => {
    const ref = new Date()
    const timeMin = parseNatural(opts?.timeMin ?? "today", ref, ctx.timeZone)
    const timeMax = parseNatural(opts?.timeMax ?? "tomorrow", ref, ctx.timeZone)
    const cal = await calendarFor(ctx.userId)

    const res = await cal.events.list({
      calendarId: "primary",
      timeMin: iso(timeMin),
      timeMax: iso(timeMax),
      maxResults: opts?.maxResults ?? 25,
      singleEvents: true,
      orderBy: "startTime",
    })
    return (res.data.items ?? []).map((e) => normalizeEvent(e, "primary"))
  }, [])
}

export async function getFreeSlots(
  ctx: McpUserContext,
  opts?: {
    timeMin?: string
    timeMax?: string
    durationMinutes?: number
    maxSlots?: number
    workingHours?: { start: string; end: string }
  }
): Promise<SafeFetchResult<FreeSlot[]>> {
  return safe(async () => {
    const ref = new Date()
    const timeMin = parseNatural(opts?.timeMin ?? "today", ref, ctx.timeZone)
    const timeMax = parseNatural(opts?.timeMax ?? "tomorrow", ref, ctx.timeZone)
    return computeFreeSlots({
      userId: ctx.userId,
      timeMin,
      timeMax,
      durationMinutes: opts?.durationMinutes ?? 30,
      maxSlots: opts?.maxSlots ?? 3,
      workingHours: opts?.workingHours ?? { start: "09:00", end: "18:00" },
    })
  }, [])
}
