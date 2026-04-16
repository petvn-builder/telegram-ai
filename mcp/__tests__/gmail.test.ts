import { describe, it, expect, vi, beforeEach } from "vitest"

const mockMessages = { list: vi.fn(), get: vi.fn() }
const mockThreads = { get: vi.fn() }

vi.mock("@/lib/google/gmail-client", () => ({
  gmailFor: async () => ({
    users: {
      messages: mockMessages,
      threads: mockThreads,
    },
  }),
}))

import { searchEmailsTool } from "../gmail/search-emails"
import { getEmailTool } from "../gmail/get-email"
import { getThreadTool } from "../gmail/get-thread"
import { extractBodies } from "@/lib/google/normalize"

beforeEach(() => {
  vi.clearAllMocks()
})

function b64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_")
}

describe("search_emails", () => {
  it("returns empty when no messages match", async () => {
    mockMessages.list.mockResolvedValueOnce({ data: { messages: [] } })
    const r = await searchEmailsTool.handler(
      { query: "from:none@x.com", maxResults: 10 } as never,
      { userId: "u1" }
    )
    expect(r.messages).toEqual([])
  })

  it("fetches metadata and normalizes summaries", async () => {
    mockMessages.list.mockResolvedValueOnce({
      data: { messages: [{ id: "m1" }, { id: "m2" }] },
    })
    mockMessages.get
      .mockResolvedValueOnce({
        data: {
          id: "m1",
          threadId: "t1",
          snippet: "hello",
          labelIds: ["UNREAD", "INBOX"],
          payload: {
            headers: [
              { name: "From", value: "Alice <alice@x.com>" },
              { name: "To", value: "me@x.com, other@x.com" },
              { name: "Subject", value: "Hi" },
              { name: "Date", value: "Mon, 01 Jan 2099 10:00:00 +0000" },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          id: "m2",
          threadId: "t1",
          snippet: "reply",
          labelIds: ["INBOX"],
          payload: { headers: [{ name: "Subject", value: "Re: Hi" }] },
        },
      })

    const r = await searchEmailsTool.handler(
      { query: "is:unread", maxResults: 10 } as never,
      { userId: "u1" }
    )

    expect(r.messages).toHaveLength(2)
    expect(r.messages[0].from).toBe("Alice <alice@x.com>")
    expect(r.messages[0].to).toEqual(["me@x.com", "other@x.com"])
    expect(r.messages[0].unread).toBe(true)
    expect(r.messages[1].unread).toBe(false)
  })
})

describe("get_email", () => {
  it("extracts plain-text body from multipart", async () => {
    mockMessages.get.mockResolvedValueOnce({
      data: {
        id: "m1",
        threadId: "t1",
        snippet: "hi",
        labelIds: [],
        payload: {
          headers: [
            { name: "From", value: "x@x.com" },
            { name: "Subject", value: "Test" },
            { name: "Date", value: "Mon, 01 Jan 2099 10:00:00 +0000" },
          ],
          parts: [
            { mimeType: "text/plain", body: { data: b64("Hello, world!") } },
            { mimeType: "text/html", body: { data: b64("<p>Hello</p>") } },
          ],
        },
      },
    })

    const r = await getEmailTool.handler({ messageId: "m1" } as never, { userId: "u1" })
    expect(r.bodyText).toBe("Hello, world!")
    expect(r.bodyHtml).toContain("<p>")
  })

  it("falls back to HTML when no text/plain part exists", () => {
    const { text } = extractBodies({
      mimeType: "text/html",
      body: { data: b64("<p>Rich <b>body</b></p>") },
    } as never)
    expect(text).toBe("Rich body")
  })
})

describe("get_thread", () => {
  it("returns threadId, subject, and normalized messages", async () => {
    mockThreads.get.mockResolvedValueOnce({
      data: {
        messages: [
          {
            id: "m1",
            threadId: "t1",
            snippet: "first",
            payload: {
              headers: [
                { name: "Subject", value: "Original" },
                { name: "Date", value: "Mon, 01 Jan 2099 10:00:00 +0000" },
              ],
            },
          },
          {
            id: "m2",
            threadId: "t1",
            snippet: "reply",
            payload: {
              headers: [
                { name: "Subject", value: "Re: Original" },
                { name: "Date", value: "Mon, 01 Jan 2099 11:00:00 +0000" },
              ],
            },
          },
        ],
      },
    })

    const r = await getThreadTool.handler(
      { threadId: "t1", maxMessages: 20 } as never,
      { userId: "u1" }
    )
    expect(r.threadId).toBe("t1")
    expect(r.subject).toBe("Original")
    expect(r.messages).toHaveLength(2)
  })
})
