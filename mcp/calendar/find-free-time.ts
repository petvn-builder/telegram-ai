import { z } from "zod"
import { defineTool } from "../tool-registry"
import { parseNatural } from "../shared/time"
import { wrapGoogleError } from "../shared/errors"
import { computeFreeSlots } from "@/lib/google/free-time"
import type { FreeSlot } from "../shared/types"

const input = z.object({
  timeMin: z.string().max(200).describe("Range start (ISO or natural language)."),
  timeMax: z.string().max(200).describe("Range end."),
  durationMinutes: z.number().int().min(5).max(24 * 60),
  calendarIds: z.array(z.string()).max(10).default(["primary"]),
  workingHours: z
    .object({
      start: z.string().regex(/^\d{2}:\d{2}$/).describe('Local "HH:MM" start of working day.'),
      end: z.string().regex(/^\d{2}:\d{2}$/).describe('Local "HH:MM" end of working day.'),
    })
    .optional(),
  maxSlots: z.number().int().min(1).max(20).default(10),
})

export const findFreeTimeTool = defineTool({
  name: "find_free_time",
  description: "Find open time slots of a given duration in a range, optionally constrained to working hours. Returns up to `maxSlots` slots.",
  inputSchema: input,
  handler: async (args, ctx): Promise<{ slots: FreeSlot[] }> => {
    const timeMin = parseNatural(args.timeMin, new Date(), ctx.timeZone)
    const timeMax = parseNatural(args.timeMax, new Date(), ctx.timeZone)
    try {
      const slots = await computeFreeSlots({
        userId: ctx.userId,
        timeMin,
        timeMax,
        durationMinutes: args.durationMinutes,
        calendarIds: args.calendarIds,
        workingHours: args.workingHours,
        maxSlots: args.maxSlots,
      })
      return { slots }
    } catch (e) {
      throw wrapGoogleError(e)
    }
  },
})
