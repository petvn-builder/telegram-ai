import { z } from "zod"
import { defineTool } from "../tool-registry"
import { calendarFor } from "@/lib/google/calendar-client"
import { normalizeEvent } from "@/lib/google/normalize"
import { parseNatural, iso } from "../shared/time"
import { wrapGoogleError } from "../shared/errors"
import type { NormalizedEvent } from "../shared/types"

const input = z.object({
  eventId: z.string().min(1).max(256),
  calendarId: z.string().max(256).default("primary"),
  summary: z.string().max(1024).optional(),
  start: z.string().max(200).optional().describe("New start (ISO or natural language)"),
  end: z.string().max(200).optional(),
  description: z.string().max(8192).optional(),
  location: z.string().max(256).optional(),
  attendees: z.array(z.email()).max(100).optional(),
  timeZone: z.string().optional(),
  sendUpdates: z.enum(["all", "externalOnly", "none"]).default("all"),
})

export const updateEventTool = defineTool({
  name: "update_event",
  description: "Update fields on an existing calendar event. Only provided fields are changed (patch semantics).",
  inputSchema: input,
  handler: async (args, ctx): Promise<NormalizedEvent> => {
    const cal = await calendarFor(ctx.userId)

    const body: Record<string, unknown> = {}
    if (args.summary !== undefined) body.summary = args.summary
    if (args.description !== undefined) body.description = args.description
    if (args.location !== undefined) body.location = args.location
    if (args.start) {
      const s = parseNatural(args.start)
      body.start = args.timeZone ? { dateTime: iso(s), timeZone: args.timeZone } : { dateTime: iso(s) }
    }
    if (args.end) {
      const e = parseNatural(args.end)
      body.end = args.timeZone ? { dateTime: iso(e), timeZone: args.timeZone } : { dateTime: iso(e) }
    }
    if (args.attendees) body.attendees = args.attendees.map((email) => ({ email }))

    try {
      const res = await cal.events.patch({
        calendarId: args.calendarId,
        eventId: args.eventId,
        sendUpdates: args.sendUpdates,
        requestBody: body,
      })
      return normalizeEvent(res.data!, args.calendarId)
    } catch (e) {
      throw wrapGoogleError(e)
    }
  },
})
