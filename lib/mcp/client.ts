import { gmailFor } from "@/lib/google/gmail-client"
import { calendarFor } from "@/lib/google/calendar-client"
import {
  normalizeEmailSummary,
  normalizeEvent,
} from "@/lib/google/normalize"
import { parseNatural, iso } from "@/mcp/shared/time"
import type {
  NormalizedEmailSummary,
  NormalizedEvent,
} from "@/mcp/shared/types"

export type McpUserContext = { userId: string; timeZone: string }

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

export async function getEmails(
  ctx: McpUserContext,
  opts?: { query?: string; maxResults?: number }
): Promise<SafeFetchResult<NormalizedEmailSummary[]>> {
  return safe(async () => {
    const query = opts?.query ?? "newer_than:2d -category:promotions"
    const maxResults = opts?.maxResults ?? 15
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
    return fetched.map((r) => normalizeEmailSummary(r.data))
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
