import { searchEmailsTool } from "@/mcp/gmail/search-emails"
import { getEventsTool } from "@/mcp/calendar/get-events"
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
  return /not connected|reconnect|invalid_grant|auth_error/i.test(msg)
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
    const res = await searchEmailsTool.handler(
      {
        query: opts?.query ?? "newer_than:2d -category:promotions",
        maxResults: opts?.maxResults ?? 15,
      },
      ctx
    )
    return res.messages
  }, [])
}

export async function getCalendarEvents(
  ctx: McpUserContext,
  opts?: { timeMin?: string; timeMax?: string; maxResults?: number }
): Promise<SafeFetchResult<NormalizedEvent[]>> {
  return safe(async () => {
    const res = await getEventsTool.handler(
      {
        timeMin: opts?.timeMin ?? "today",
        timeMax: opts?.timeMax ?? "tomorrow",
        calendarId: "primary",
        maxResults: opts?.maxResults ?? 25,
      },
      ctx
    )
    return res.events
  }, [])
}
