// Normalized, LLM-friendly shapes. All timestamps are ISO 8601.

export interface NormalizedEventAttendee {
  email: string
  name?: string
  response?: "accepted" | "declined" | "tentative" | "needsAction"
}

export interface NormalizedEvent {
  id: string
  calendarId: string
  summary: string
  description?: string
  location?: string
  start: string
  end: string
  allDay: boolean
  attendees: NormalizedEventAttendee[]
  organizer?: { email: string; name?: string }
  htmlLink: string
  status: "confirmed" | "tentative" | "cancelled"
}

export interface NormalizedEmailSummary {
  id: string
  threadId: string
  from: string
  to: string[]
  subject: string
  snippet: string
  date: string
  unread: boolean
  labels: string[]
}

export interface NormalizedEmail extends NormalizedEmailSummary {
  cc?: string[]
  bcc?: string[]
  bodyText: string
  bodyHtml?: string
}

export interface FreeSlot {
  start: string
  end: string
  durationMinutes: number
}

export interface TimeRange {
  start: string
  end: string
}
