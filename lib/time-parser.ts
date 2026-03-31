export interface TimeRange {
  start: Date
  end: Date
  label: string
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function endOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

// Monday = 0, Sunday = 6
function getMondayOfWeek(d: Date): Date {
  const dayOfWeek = (d.getDay() + 6) % 7
  return startOfDay(addDays(d, -dayOfWeek))
}

export function parseTimeRange(text: string): TimeRange | null {
  const now = new Date()

  // today
  if (/\btoday\b/i.test(text)) {
    return { start: startOfDay(now), end: now, label: "today" }
  }

  // yesterday
  if (/\byesterday\b/i.test(text)) {
    const yesterday = addDays(now, -1)
    return { start: startOfDay(yesterday), end: endOfDay(yesterday), label: "yesterday" }
  }

  // this week
  if (/\bthis\s+week\b/i.test(text)) {
    return { start: getMondayOfWeek(now), end: now, label: "this week" }
  }

  // last week
  if (/\blast\s+week\b/i.test(text)) {
    const thisMonday = getMondayOfWeek(now)
    const lastMonday = addDays(thisMonday, -7)
    const lastSunday = addDays(thisMonday, -1)
    return { start: lastMonday, end: endOfDay(lastSunday), label: "last week" }
  }

  // last N days (must come before "last 30 days" fallback)
  const lastNDaysMatch = text.match(/\blast\s+(\d+)\s+days?\b/i)
  if (lastNDaysMatch) {
    const n = parseInt(lastNDaysMatch[1], 10)
    return { start: addDays(now, -n), end: now, label: `last ${n} days` }
  }

  // this month
  if (/\bthis\s+month\b/i.test(text)) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    return { start, end: now, label: "this month" }
  }

  // last month
  if (/\blast\s+month\b/i.test(text)) {
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
    const lastDayOfLastMonth = endOfDay(addDays(firstOfThisMonth, -1))
    return { start: firstOfLastMonth, end: lastDayOfLastMonth, label: "last month" }
  }

  return null
}
