import { describe, it, expect } from "vitest"
import { registry, toMcpTool, toOpenAiTool, getTool } from "../tool-registry"

describe("tool-registry", () => {
  it("registers all required tools", () => {
    const names = registry.map((t) => t.name).sort()
    expect(names).toEqual(
      [
        "create_email_draft",
        "create_event",
        "create_reply_draft",
        "create_task",
        "delete_event",
        "delete_task",
        "find_free_time",
        "get_email",
        "get_events",
        "get_thread",
        "list_tasks",
        "search_emails",
        "search_notes",
        "update_event",
        "update_task",
      ].sort()
    )
  })

  it("produces MCP-shaped descriptors", () => {
    const d = toMcpTool(registry[0])
    expect(d.name).toBeTruthy()
    expect(d.description).toBeTruthy()
    expect(d.inputSchema.type).toBe("object")
    expect(d.inputSchema.properties).toBeTypeOf("object")
  })

  it("produces OpenAI function-tool descriptors", () => {
    const d = toOpenAiTool(registry[0])
    expect(d.type).toBe("function")
    expect(d.function.name).toBe(registry[0].name)
    expect(d.function.parameters.type).toBe("object")
  })

  it("looks up tools by name", () => {
    expect(getTool("get_events")).toBeDefined()
    expect(getTool("nope")).toBeUndefined()
  })

  it("rejects invalid input via zod", () => {
    const createEvent = getTool("create_event")!
    expect(() => createEvent.inputSchema.parse({})).toThrow()
    // Valid:
    const parsed = createEvent.inputSchema.parse({
      summary: "x",
      start: "tomorrow 3pm",
      durationMinutes: 30,
    }) as { summary: string; calendarId: string }
    expect(parsed.summary).toBe("x")
    expect(parsed.calendarId).toBe("primary") // default
  })
})
