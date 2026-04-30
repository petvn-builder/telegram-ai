import { calendarFor } from "./calendar-client"
import { normalizeEvent } from "./normalize"
import type { NormalizedEvent } from "@/mcp/shared/types"

export type CreateEventArgs = {
  userId: string
  summary: string
  start: Date
  end: Date
  description?: string
  location?: string
  attendees?: string[]
  calendarId?: string
  timeZone?: string
  sendUpdates?: "all" | "externalOnly" | "none"
}

export async function createCalendarEvent(args: CreateEventArgs): Promise<NormalizedEvent> {
  if (args.end <= args.start) {
    throw new Error("End time must be after start time")
  }
  const calendarId = args.calendarId ?? "primary"
  const cal = await calendarFor(args.userId)

  const res = await cal.events.insert({
    calendarId,
    sendUpdates: args.sendUpdates ?? "all",
    requestBody: {
      summary: args.summary,
      description: args.description,
      location: args.location,
      start: { dateTime: args.start.toISOString(), timeZone: args.timeZone },
      end: { dateTime: args.end.toISOString(), timeZone: args.timeZone },
      attendees: args.attendees?.map((email) => ({ email })),
    },
  })
  if (!res.data) throw new Error("Empty response from Google Calendar")
  return normalizeEvent(res.data, calendarId)
}
