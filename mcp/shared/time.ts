import * as chrono from "chrono-node"

/** Convert IANA timezone to UTC offset in minutes for chrono-node. */
function ianaToOffset(tz: string): number {
  const now = new Date()
  const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }))
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }))
  return (local.getTime() - utc.getTime()) / 60_000
}

/**
 * Parse a natural-language or ISO datetime string into a Date.
 * Falls back to new Date(input) for plain ISO strings chrono can't parse.
 * Throws if nothing parses.
 */
export function parseNatural(input: string, ref: Date = new Date(), timeZone?: string): Date {
  if (!input || input.length > 500) throw new Error("parseNatural: invalid input")
  // Try ISO direct first — cheap and exact.
  // Only bypass chrono for ISO strings that already include a timezone (Z or ±offset).
  // Bare ISO strings like "2026-04-18T17:00:00" should go through chrono for timezone handling.
  const iso = new Date(input)
  if (!Number.isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(input) && /[Zz]|[+-]\d{2}/.test(input)) return iso

  const offset = timeZone ? ianaToOffset(timeZone) : undefined
  const refOption = offset !== undefined ? { instant: ref, timezone: offset } : ref
  const parsed = chrono.parseDate(input, refOption, { forwardDate: true })
  if (parsed) {
    console.log("[parseNatural]", JSON.stringify({ input, timeZone, offset, ref: ref.toISOString(), result: parsed.toISOString() }))
    return parsed
  }

  // Last resort
  if (!Number.isNaN(iso.getTime())) return iso
  throw new Error(`Could not parse date/time: "${input}"`)
}

export interface Range {
  start: Date
  end: Date
}

export function parseRange(
  start: string,
  end?: string,
  durationMinutes?: number,
  ref: Date = new Date(),
  timeZone?: string,
): Range {
  const s = parseNatural(start, ref, timeZone)
  if (end) return { start: s, end: parseNatural(end, s, timeZone) }
  if (durationMinutes && durationMinutes > 0) {
    return { start: s, end: new Date(s.getTime() + durationMinutes * 60_000) }
  }
  // Default: 1 hour
  return { start: s, end: new Date(s.getTime() + 60 * 60_000) }
}

export function iso(d: Date): string {
  return d.toISOString()
}
