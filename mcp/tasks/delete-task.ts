import { z } from "zod"
import { defineTool } from "../tool-registry"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { pushDelete } from "@/lib/google/task-sync"
import { ToolError } from "../shared/errors"

const input = z.object({
  taskId: z.string().uuid().describe("ID of the task to delete."),
})

export const deleteTaskTool = defineTool({
  name: "delete_task",
  description: "Delete a task. Also removes it from Google Tasks if synced.",
  inputSchema: input,
  handler: async (args, ctx) => {
    const db = getSupabaseAdmin()

    // Fetch google_task_id before deleting
    const { data: task } = await db
      .from("tasks")
      .select("google_task_id, google_task_list_id")
      .eq("id", args.taskId)
      .eq("user_id", ctx.userId)
      .maybeSingle()

    if (!task) throw new ToolError("not_found", "Task not found.")

    const { error } = await db
      .from("tasks")
      .delete()
      .eq("id", args.taskId)
      .eq("user_id", ctx.userId)

    if (error) throw new ToolError("google_error", "Delete failed.")

    // Push delete to Google Tasks in the background
    if (task.google_task_id) {
      pushDelete(ctx.userId, task.google_task_id, task.google_task_list_id || "@default").catch(() => {})
    }

    return { ok: true }
  },
})
