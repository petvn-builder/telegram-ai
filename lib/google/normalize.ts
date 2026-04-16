import type { calendar_v3, gmail_v1, tasks_v1 } from "googleapis"
import type {
  NormalizedEvent,
  NormalizedEmail,
  NormalizedEmailSummary,
  NormalizedTask,
} from "@/mcp/shared/types"

// ── Calendar ─────────────────────────────────────────────────────────────────

export function normalizeEvent(
  e: calendar_v3.Schema$Event,
  calendarId = "primary"
): NormalizedEvent {
  const allDay = Boolean(e.start?.date && !e.start?.dateTime)
  const start = e.start?.dateTime ?? e.start?.date ?? ""
  const end = e.end?.dateTime ?? e.end?.date ?? ""

  return {
    id: e.id ?? "",
    calendarId,
    summary: e.summary ?? "(no title)",
    description: e.description ?? undefined,
    location: e.location ?? undefined,
    start,
    end,
    allDay,
    attendees: (e.attendees ?? []).map((a) => ({
      email: a.email ?? "",
      name: a.displayName ?? undefined,
      response: (a.responseStatus as NormalizedEvent["attendees"][number]["response"]) ?? undefined,
    })),
    organizer: e.organizer?.email
      ? { email: e.organizer.email, name: e.organizer.displayName ?? undefined }
      : undefined,
    htmlLink: e.htmlLink ?? "",
    status: (e.status as NormalizedEvent["status"]) ?? "confirmed",
  }
}

// ── Tasks ───────────────────────────────────────────────────────────────────

export function normalizeTask(
  t: tasks_v1.Schema$Task,
  taskListId = "@default"
): NormalizedTask {
  return {
    id: t.id ?? "",
    taskListId,
    title: t.title ?? "(no title)",
    notes: t.notes ?? undefined,
    due: t.due ? t.due.split("T")[0] : undefined,
    status: (t.status as NormalizedTask["status"]) ?? "needsAction",
    htmlLink: t.selfLink ?? "",
  }
}

// ── Gmail ────────────────────────────────────────────────────────────────────

function header(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  const h = (headers ?? []).find((x) => x.name?.toLowerCase() === name.toLowerCase())
  return h?.value ?? ""
}

function splitAddresses(v: string): string[] {
  if (!v) return []
  return v.split(",").map((s) => s.trim()).filter(Boolean)
}

function decodeBody(data: string | undefined | null): string {
  if (!data) return ""
  const b = Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64")
  return b.toString("utf8")
}

/** DFS through message parts, pulling out the first text/plain and text/html bodies. */
export function extractBodies(payload: gmail_v1.Schema$MessagePart | undefined): {
  text: string
  html?: string
} {
  let text: string | null = null
  let html: string | null = null

  function walk(part?: gmail_v1.Schema$MessagePart) {
    if (!part) return
    const mime = part.mimeType ?? ""
    const data = part.body?.data
    if (mime === "text/plain" && !text && data) text = decodeBody(data)
    else if (mime === "text/html" && !html && data) html = decodeBody(data)
    if (part.parts) for (const p of part.parts) walk(p)
  }
  walk(payload)

  if (!text && html) text = stripHtml(html)
  return { text: text ?? "", html: html ?? undefined }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function normalizeEmailSummary(m: gmail_v1.Schema$Message): NormalizedEmailSummary {
  const headers = m.payload?.headers
  const dateHeader = header(headers, "date")
  const date = dateHeader ? new Date(dateHeader).toISOString() : new Date(Number(m.internalDate ?? 0)).toISOString()
  const labels = m.labelIds ?? []
  return {
    id: m.id ?? "",
    threadId: m.threadId ?? "",
    from: header(headers, "from"),
    to: splitAddresses(header(headers, "to")),
    subject: header(headers, "subject"),
    snippet: m.snippet ?? "",
    date,
    unread: labels.includes("UNREAD"),
    labels,
  }
}

export function normalizeEmail(m: gmail_v1.Schema$Message): NormalizedEmail {
  const summary = normalizeEmailSummary(m)
  const headers = m.payload?.headers
  const { text, html } = extractBodies(m.payload)
  return {
    ...summary,
    cc: splitAddresses(header(headers, "cc")) || undefined,
    bodyText: text,
    bodyHtml: html,
  }
}
