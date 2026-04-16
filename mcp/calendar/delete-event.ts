import { z } from "zod"
import { defineTool } from "../tool-registry"
import { calendarFor } from "@/lib/google/calendar-client"
import { wrapGoogleError } from "../shared/errors"

const input = z.object({
  eventId: z.string().min(1).max(256),
  calendarId: z.string().max(256).default("primary"),
  sendUpdates: z.enum(["all", "externalOnly", "none"]).default("all"),
})

export const deleteEventTool = defineTool({
  name: "delete_event",
  description: "Delete a calendar event. Returns { deleted: true, eventId } on success.",
  inputSchema: input,
  handler: async (args, ctx): Promise<{ deleted: true; eventId: string }> => {
    const cal = await calendarFor(ctx.userId)
    try {
      await cal.events.delete({
        calendarId: args.calendarId,
        eventId: args.eventId,
        sendUpdates: args.sendUpdates,
      })
      return { deleted: true, eventId: args.eventId }
    } catch (e) {
      throw wrapGoogleError(e)
    }
  },
})
