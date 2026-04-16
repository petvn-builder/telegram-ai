import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock the Google client module ────────────────────────────────────────────
const mockEvents = {
  list: vi.fn(),
  insert: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}
const mockFreebusy = { query: vi.fn() }

vi.mock("@/lib/google/calendar-client", () => ({
  calendarFor: async () => ({
    events: mockEvents,
    freebusy: mockFreebusy,
  }),
}))

import { getEventsTool } from "../calendar/get-events"
import { createEventTool } from "../calendar/create-event"
import { deleteEventTool } from "../calendar/delete-event"
import { findFreeTimeTool } from "../calendar/find-free-time"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("get_events", () => {
  it("normalizes events returned by Google", async () => {
    mockEvents.list.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: "evt1",
            summary: "Standup",
            start: { dateTime: "2026-04-17T09:00:00Z" },
            end: { dateTime: "2026-04-17T09:30:00Z" },
            attendees: [{ email: "a@x.com", responseStatus: "accepted" }],
            organizer: { email: "me@x.com" },
            htmlLink: "https://cal/evt1",
            status: "confirmed",
          },
        ],
      },
    })

    const res = await getEventsTool.handler(
      { timeMin: "2026-04-17T00:00:00Z", timeMax: "2026-04-18T00:00:00Z", calendarId: "primary", maxResults: 20 } as never,
      { userId: "u1" }
    )

    expect(res.events).toHaveLength(1)
    const e = res.events[0]
    expect(e.id).toBe("evt1")
    expect(e.summary).toBe("Standup")
    expect(e.allDay).toBe(false)
    expect(e.attendees[0]).toEqual({ email: "a@x.com", name: undefined, response: "accepted" })
    expect(e.organizer?.email).toBe("me@x.com")
    expect(e.htmlLink).toBe("https://cal/evt1")
  })
})

describe("create_event", () => {
  it("requires end or durationMinutes", async () => {
    await expect(
      createEventTool.handler(
        { summary: "x", start: "tomorrow 3pm", calendarId: "primary", sendUpdates: "all" } as never,
        { userId: "u1" }
      )
    ).rejects.toThrow(/end.*durationMinutes/i)
  })

  it("uses durationMinutes to compute end and posts normalized body", async () => {
    mockEvents.insert.mockResolvedValueOnce({
      data: {
        id: "new1",
        summary: "Chat",
        start: { dateTime: "2099-01-01T15:00:00Z" },
        end: { dateTime: "2099-01-01T15:30:00Z" },
        status: "confirmed",
        htmlLink: "https://cal/new1",
      },
    })

    const res = await createEventTool.handler(
      {
        summary: "Chat",
        start: "2099-01-01T15:00:00Z",
        durationMinutes: 30,
        calendarId: "primary",
        sendUpdates: "all",
      } as never,
      { userId: "u1" }
    )

    expect(mockEvents.insert).toHaveBeenCalledOnce()
    const call = mockEvents.insert.mock.calls[0][0]
    expect(call.calendarId).toBe("primary")
    expect(call.requestBody.summary).toBe("Chat")
    expect(call.requestBody.start.dateTime).toBe("2099-01-01T15:00:00.000Z")
    expect(call.requestBody.end.dateTime).toBe("2099-01-01T15:30:00.000Z")
    expect(res.id).toBe("new1")
  })
})

describe("delete_event", () => {
  it("returns { deleted: true, eventId }", async () => {
    mockEvents.delete.mockResolvedValueOnce({})
    const res = await deleteEventTool.handler(
      { eventId: "abc", calendarId: "primary", sendUpdates: "none" } as never,
      { userId: "u1" }
    )
    expect(res).toEqual({ deleted: true, eventId: "abc" })
  })
})

describe("find_free_time", () => {
  it("inverts busy intervals into free slots", async () => {
    // Range: 2099-01-01 09:00 - 17:00 UTC
    // Busy: 11:00-12:00, 14:00-15:30
    mockFreebusy.query.mockResolvedValueOnce({
      data: {
        calendars: {
          primary: {
            busy: [
              { start: "2099-01-01T11:00:00Z", end: "2099-01-01T12:00:00Z" },
              { start: "2099-01-01T14:00:00Z", end: "2099-01-01T15:30:00Z" },
            ],
          },
        },
      },
    })

    const res = await findFreeTimeTool.handler(
      {
        timeMin: "2099-01-01T09:00:00Z",
        timeMax: "2099-01-01T17:00:00Z",
        durationMinutes: 60,
        calendarIds: ["primary"],
        maxSlots: 10,
      } as never,
      { userId: "u1" }
    )

    // Expect slots: 09-11 (2h), 12-14 (2h), 15:30-17 (1.5h)
    expect(res.slots.length).toBe(3)
    expect(res.slots[0].start).toBe("2099-01-01T09:00:00.000Z")
    expect(res.slots[0].end).toBe("2099-01-01T11:00:00.000Z")
    expect(res.slots[1].start).toBe("2099-01-01T12:00:00.000Z")
    expect(res.slots[2].start).toBe("2099-01-01T15:30:00.000Z")
    expect(res.slots[2].durationMinutes).toBe(90)
  })

  it("filters out slots shorter than the requested duration", async () => {
    mockFreebusy.query.mockResolvedValueOnce({
      data: {
        calendars: {
          primary: {
            busy: [
              { start: "2099-01-01T09:30:00Z", end: "2099-01-01T10:00:00Z" },
            ],
          },
        },
      },
    })

    const res = await findFreeTimeTool.handler(
      {
        timeMin: "2099-01-01T09:00:00Z",
        timeMax: "2099-01-01T10:30:00Z",
        durationMinutes: 60,
        calendarIds: ["primary"],
        maxSlots: 10,
      } as never,
      { userId: "u1" }
    )

    // 09:00-09:30 (30m) and 10:00-10:30 (30m) — both too short
    expect(res.slots).toEqual([])
  })
})
