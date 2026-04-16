import * as chrono from "chrono-node"

/**
 * Parse a natural-language or ISO datetime string into a Date.
 * Falls back to new Date(input) for plain ISO strings chrono can't parse.
 * Throws if nothing parses.
 */
export function parseNatural(input: string, ref: Date = new Date()): Date {
  if (!input || input.length > 500) throw new Error("parseNatural: invalid input")
  // Try ISO direct first — cheap and exact.
  const iso = new Date(input)
  if (!Number.isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(input)) return iso

  const parsed = chrono.parseDate(input, ref, { forwardDate: true })
  if (parsed) return parsed

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
  ref: Date = new Date()
): Range {
  const s = parseNatural(start, ref)
  if (end) return { start: s, end: parseNatural(end, s) }
  if (durationMinutes && durationMinutes > 0) {
    return { start: s, end: new Date(s.getTime() + durationMinutes * 60_000) }
  }
  // Default: 1 hour
  return { start: s, end: new Date(s.getTime() + 60 * 60_000) }
}

export function iso(d: Date): string {
  return d.toISOString()
}
