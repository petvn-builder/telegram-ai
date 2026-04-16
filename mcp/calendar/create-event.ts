import { z } from "zod"
import { defineTool } from "../tool-registry"
import { calendarFor } from "@/lib/google/calendar-client"
import { normalizeEvent } from "@/lib/google/normalize"
import { parseRange, iso } from "../shared/time"
import { wrapGoogleError, ToolError } from "../shared/errors"
import type { NormalizedEvent } from "../shared/types"

const input = z.object({
  summary: z.string().min(1).max(1024).describe("Event title."),
  start: z.string().max(200).describe('Start time. ISO 8601 or natural language ("tomorrow 3pm").'),
  end: z.string().max(200).optional().describe("End time. If omitted, set durationMinutes."),
  durationMinutes: z.number().int().min(5).max(24 * 60).optional(),
  description: z.string().max(8192).optional(),
  location: z.string().max(256).optional(),
  attendees: z.array(z.email()).max(100).optional().describe("Attendee email addresses."),
  calendarId: z.string().default("primary"),
  timeZone: z.string().optional().describe('IANA time zone, e.g. "America/Los_Angeles".'),
  sendUpdates: z.enum(["all", "externalOnly", "none"]).default("all"),
})

export const createEventTool = defineTool({
  name: "create_event",
  description: "Create a calendar event. Accepts natural-language start/end times and returns the normalized created event.",
  inputSchema: input,
  handler: async (args, ctx): Promise<NormalizedEvent> => {
    if (!args.end && !args.durationMinutes) {
      throw new ToolError("invalid_input", "Provide either `end` or `durationMinutes`.")
    }
    const { start, end } = parseRange(args.start, args.end, args.durationMinutes)
    const cal = await calendarFor(ctx.userId)

    try {
      const res = await cal.events.insert({
        calendarId: args.calendarId,
        sendUpdates: args.sendUpdates,
        requestBody: {
          summary: args.summary,
          description: args.description,
          location: args.location,
          start: args.timeZone ? { dateTime: iso(start), timeZone: args.timeZone } : { dateTime: iso(start) },
          end: args.timeZone ? { dateTime: iso(end), timeZone: args.timeZone } : { dateTime: iso(end) },
          attendees: args.attendees?.map((email) => ({ email })),
        },
      })
      if (!res.data) throw new ToolError("google_error", "Empty response from Google Calendar")
      return normalizeEvent(res.data, args.calendarId)
    } catch (e) {
      if (e instanceof ToolError) throw e
      throw wrapGoogleError(e)
    }
  },
})
