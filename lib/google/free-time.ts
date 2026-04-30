import { calendarFor } from "./calendar-client"
import type { FreeSlot } from "@/mcp/shared/types"

export type WorkingHours = { start: string; end: string }

export type ComputeFreeSlotsArgs = {
  userId: string
  timeMin: Date
  timeMax: Date
  durationMinutes: number
  calendarIds?: string[]
  workingHours?: WorkingHours
  maxSlots?: number
}

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
  wh?: WorkingHours
): Interval[] {
  if (!wh) return [{ start, end }]
  const [sH, sM] = wh.start.split(":").map(Number)
  const [eH, eM] = wh.end.split(":").map(Number)

  const days: Interval[] = []
  const day = new Date(start)
  day.setHours(0, 0, 0, 0)
  while (day.getTime() <= end) {
    const dayStart = new Date(day)
    dayStart.setHours(sH, sM, 0, 0)
    const dayEnd = new Date(day)
    dayEnd.setHours(eH, eM, 0, 0)
    const s = Math.max(dayStart.getTime(), start)
    const e = Math.min(dayEnd.getTime(), end)
    if (e > s) days.push({ start: s, end: e })
    day.setDate(day.getDate() + 1)
  }
  return days
}

export async function computeFreeSlots(args: ComputeFreeSlotsArgs): Promise<FreeSlot[]> {
  const calendarIds = args.calendarIds ?? ["primary"]
  const maxSlots = args.maxSlots ?? 10
  const cal = await calendarFor(args.userId)

  let busy: Interval[] = []
  const fb = await cal.freebusy.query({
    requestBody: {
      timeMin: args.timeMin.toISOString(),
      timeMax: args.timeMax.toISOString(),
      items: calendarIds.map((id) => ({ id })),
    },
  })
  const cals = fb.data.calendars ?? {}
  for (const id of calendarIds) {
    for (const b of cals[id]?.busy ?? []) {
      if (b.start && b.end)
        busy.push({
          start: new Date(b.start).getTime(),
          end: new Date(b.end).getTime(),
        })
    }
  }
  busy = mergeAndSort(busy)

  const windows = clipToWorkingHours(
    args.timeMin.getTime(),
    args.timeMax.getTime(),
    args.workingHours
  )
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
          if (slots.length >= maxSlots) return slots
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
      if (slots.length >= maxSlots) return slots
    }
  }

  return slots
}
