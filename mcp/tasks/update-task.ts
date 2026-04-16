import { z } from "zod"
import { defineTool } from "../tool-registry"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { pushUpdate } from "@/lib/google/task-sync"
import { parseNatural } from "../shared/time"
import { ToolError } from "../shared/errors"

const input = z.object({
  taskId: z.string().uuid().describe("ID of the task to update."),
  title: z.string().min(1).max(1024).optional().describe("New title."),
  description: z.string().max(8192).optional().describe("New description."),
  status: z.enum(["inbox", "next", "doing", "waiting", "done"]).optional().describe("New status."),
  priority: z.enum(["low", "medium", "high"]).optional().describe("New priority."),
  due: z.string().max(200).optional().describe('New due date. ISO 8601 or natural language ("tomorrow").'),
})

export const updateTaskTool = defineTool({
  name: "update_task",
  description: "Update a task's title, description, status, priority, or due date. Syncs with Google Tasks automatically.",
  inputSchema: input,
  handler: async (args, ctx) => {
    const db = getSupabaseAdmin()
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (args.title !== undefined) updates.title = args.title
    if (args.description !== undefined) updates.description = args.description
    if (args.status !== undefined) updates.status = args.status
    if (args.priority !== undefined) updates.priority = args.priority
    if (args.due !== undefined) {
      const d = parseNatural(args.due, new Date(), ctx.timeZone)
      updates.due_date = d.toISOString()
    }

    const { data, error } = await db
      .from("tasks")
      .update(updates)
      .eq("id", args.taskId)
      .eq("user_id", ctx.userId)
      .select("*, google_task_id, google_task_list_id")
      .single()

    if (error || !data) throw new ToolError("not_found", "Task not found or update failed.")

    // Push to Google Tasks in the background
    pushUpdate(ctx.userId, data).catch(() => {})

    return data
  },
})
