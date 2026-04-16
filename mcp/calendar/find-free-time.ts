import { z } from "zod"
import { defineTool } from "../tool-registry"
import { calendarFor } from "@/lib/google/calendar-client"
import { parseNatural, iso } from "../shared/time"
import { wrapGoogleError } from "../shared/errors"
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

interface Interval {
  start: number
  end: number
}

function mergeAndSort(busy: Interval[]): Interval[] {
  if (busy.length === 0) return []
  const sorted = [...busy].sort((a, b) => a.start - b.start)
  const out: Interval[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1]
    const cur = sorted[i]
    if (cur.start <= last.end) last.end = Math.max(last.end, cur.end)
    else out.push(cur)
  }
  return out
}

function clipToWorkingHours(
  start: number,
  end: number,
  wh?: { start: string; end: string }
): Interval[] {
  if (!wh) return [{ start, end }]
  const [sH, sM] = wh.start.split(":").map(Number)
  const [eH, eM] = wh.end.split(":").map(Number)

  const days: Interval[] = []
  const day = new Date(start)
  day.setHours(0, 0, 0, 0)
  while (day.getTime() <= end) {
    const dayStart = new Date(day); dayStart.setHours(sH, sM, 0, 0)
    const dayEnd = new Date(day); dayEnd.setHours(eH, eM, 0, 0)
    const s = Math.max(dayStart.getTime(), start)
    const e = Math.min(dayEnd.getTime(), end)
    if (e > s) days.push({ start: s, end: e })
    day.setDate(day.getDate() + 1)
  }
  return days
}

export const findFreeTimeTool = defineTool({
  name: "find_free_time",
  description: "Find open time slots of a given duration in a range, optionally constrained to working hours. Returns up to `maxSlots` slots.",
  inputSchema: input,
  handler: async (args, ctx): Promise<{ slots: FreeSlot[] }> => {
    const timeMin = parseNatural(args.timeMin)
    const timeMax = parseNatural(args.timeMax)
    const cal = await calendarFor(ctx.userId)

    let busy: Interval[] = []
    try {
      const fb = await cal.freebusy.query({
        requestBody: {
          timeMin: iso(timeMin),
          timeMax: iso(timeMax),
          items: args.calendarIds.map((id) => ({ id })),
        },
      })
      const cals = fb.data.calendars ?? {}
      for (const id of args.calendarIds) {
        for (const b of cals[id]?.busy ?? []) {
          if (b.start && b.end) busy.push({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() })
        }
      }
    } catch (e) {
      throw wrapGoogleError(e)
    }

    busy = mergeAndSort(busy)

    const windows = clipToWorkingHours(timeMin.getTime(), timeMax.getTime(), args.workingHours)
    const durMs = args.durationMinutes * 60_000
    const slots: FreeSlot[] = []

    for (const w of windows) {
      let cursor = w.start
      for (const b of busy) {
        if (b.end <= cursor) continue
        if (b.start >= w.end) break
        if (b.start > cursor) {
          const gapEnd = Math.min(b.start, w.end)
          if (gapEnd - cursor >= durMs) {
            slots.push({
              start: new Date(cursor).toISOString(),
              end: new Date(gapEnd).toISOString(),
              durationMinutes: Math.floor((gapEnd - cursor) / 60_000),
            })
            if (slots.length >= args.maxSlots) return { slots }
          }
        }
        cursor = Math.max(cursor, b.end)
      }
      if (w.end - cursor >= durMs) {
        slots.push({
          start: new Date(cursor).toISOString(),
          end: new Date(w.end).toISOString(),
          durationMinutes: Math.floor((w.end - cursor) / 60_000),
        })
        if (slots.length >= args.maxSlots) return { slots }
      }
    }

    return { slots }
  },
})
