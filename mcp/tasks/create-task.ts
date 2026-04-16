import { z } from "zod"
import { defineTool } from "../tool-registry"
import { tasksFor } from "@/lib/google/tasks-client"
import { normalizeTask } from "@/lib/google/normalize"
import { parseNatural } from "../shared/time"
import { wrapGoogleError, ToolError } from "../shared/errors"
import type { NormalizedTask } from "../shared/types"

const input = z.object({
  title: z.string().min(1).describe("Task title."),
  notes: z.string().optional().describe("Additional details or description."),
  due: z.string().optional().describe('Due date. ISO 8601 date or natural language ("tomorrow", "next Friday").'),
  taskListId: z.string().default("@default").describe("Task list ID. Defaults to the user's primary list."),
})

export const createTaskTool = defineTool({
  name: "create_task",
  description: "Create a Google Task. Accepts natural-language due dates and returns the created task.",
  inputSchema: input,
  handler: async (args, ctx): Promise<NormalizedTask> => {
    const tasks = await tasksFor(ctx.userId)

    const requestBody: Record<string, string> = { title: args.title }
    if (args.notes) requestBody.notes = args.notes
    if (args.due) {
      const d = parseNatural(args.due)
      requestBody.due = d.toISOString().split("T")[0] + "T00:00:00.000Z"
    }

    try {
      const res = await tasks.tasks.insert({
        tasklist: args.taskListId,
        requestBody,
      })
      if (!res.data) throw new ToolError("google_error", "Empty response from Google Tasks")
      return normalizeTask(res.data, args.taskListId)
    } catch (e) {
      if (e instanceof ToolError) throw e
      throw wrapGoogleError(e)
    }
  },
})
