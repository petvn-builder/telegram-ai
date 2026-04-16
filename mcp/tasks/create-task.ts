import { z } from "zod"
import { defineTool } from "../tool-registry"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { createTask } from "@/lib/tasks"
import type { TaskWithEntities } from "@/lib/tasks"
import { parseNatural } from "../shared/time"

const input = z.object({
  title: z.string().min(1).max(1024).describe("Task title."),
  description: z.string().max(8192).optional().describe("Additional details or description."),
  due: z.string().max(200).optional().describe('Due date. ISO 8601 date or natural language ("tomorrow", "next Friday").'),
  priority: z.enum(["low", "medium", "high"]).default("medium").describe("Task priority."),
  status: z.enum(["inbox", "next", "doing", "waiting", "done"]).default("inbox").describe("Task status."),
})

export const createTaskTool = defineTool({
  name: "create_task",
  description: "Create a task. Syncs automatically with Google Tasks if connected. Accepts natural-language due dates.",
  inputSchema: input,
  handler: async (args, ctx): Promise<TaskWithEntities> => {
    const db = getSupabaseAdmin()

    let due_date: string | null = null
    if (args.due) {
      const d = parseNatural(args.due, new Date(), ctx.timeZone)
      due_date = d.toISOString()
    }

    return createTask(db, ctx.userId, {
      title: args.title,
      description: args.description,
      due_date,
      priority: args.priority,
      status: args.status,
      created_from: "manual",
    })
  },
})
