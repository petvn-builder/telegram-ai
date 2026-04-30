import { z } from "zod"
import { defineTool } from "../tool-registry"
import { parseRange, iso } from "../shared/time"
import { wrapGoogleError, ToolError } from "../shared/errors"
import { createCalendarEvent } from "@/lib/google/calendar-create"
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
    const tz = args.timeZone || ctx.timeZone
    const { start, end } = parseRange(args.start, args.end, args.durationMinutes, new Date(), tz)

    console.log("[create_event] args:", JSON.stringify({ start: args.start, end: args.end, durationMinutes: args.durationMinutes, timeZone: tz }))
    console.log("[create_event] parsed:", { start: iso(start), end: iso(end), durationMs: end.getTime() - start.getTime() })

    try {
      return await createCalendarEvent({
        userId: ctx.userId,
        summary: args.summary,
        start,
        end,
        description: args.description,
        location: args.location,
        attendees: args.attendees,
        calendarId: args.calendarId,
        timeZone: tz,
        sendUpdates: args.sendUpdates,
      })
    } catch (e) {
      if (e instanceof Error && e.message === "End time must be after start time") {
        throw new ToolError("invalid_input", e.message)
      }
      throw wrapGoogleError(e)
    }
  },
})
