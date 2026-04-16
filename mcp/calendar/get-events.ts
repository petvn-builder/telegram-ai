import { z } from "zod"
import { defineTool } from "../tool-registry"
import { calendarFor } from "@/lib/google/calendar-client"
import { normalizeEvent } from "@/lib/google/normalize"
import { parseNatural, iso } from "../shared/time"
import { wrapGoogleError } from "../shared/errors"
import type { NormalizedEvent, TimeRange } from "../shared/types"

const input = z.object({
  timeMin: z.string().describe('Start of the time range. ISO 8601 or natural language ("today", "tomorrow 9am").'),
  timeMax: z.string().describe('End of the time range. ISO 8601 or natural language ("next week").'),
  calendarId: z.string().default("primary").describe("Calendar ID; defaults to the user's primary calendar."),
  query: z.string().optional().describe("Free-text query to filter events by title/description."),
  maxResults: z.number().int().min(1).max(50).default(20),
})

export const getEventsTool = defineTool({
  name: "get_events",
  description: "List calendar events within a time range. Returns normalized events with ISO timestamps.",
  inputSchema: input,
  handler: async (args, ctx): Promise<{ events: NormalizedEvent[]; timeRange: TimeRange }> => {
    const timeMin = parseNatural(args.timeMin)
    const timeMax = parseNatural(args.timeMax)
    const cal = await calendarFor(ctx.userId)

    try {
      const res = await cal.events.list({
        calendarId: args.calendarId,
        timeMin: iso(timeMin),
        timeMax: iso(timeMax),
        q: args.query,
        maxResults: args.maxResults,
        singleEvents: true,
        orderBy: "startTime",
      })
      const events = (res.data.items ?? []).map((e) => normalizeEvent(e, args.calendarId))
      return { events, timeRange: { start: iso(timeMin), end: iso(timeMax) } }
    } catch (e) {
      throw wrapGoogleError(e)
    }
  },
})
