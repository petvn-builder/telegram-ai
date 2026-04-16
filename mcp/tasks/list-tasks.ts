import { z } from "zod"
import { defineTool } from "../tool-registry"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { pullFromGoogle } from "@/lib/google/task-sync"

const input = z.object({
  status: z
    .enum(["inbox", "next", "doing", "waiting", "done"])
    .optional()
    .describe("Filter by status. Omit to return all active (non-done) tasks."),
  limit: z.number().int().min(1).max(50).default(20).describe("Max tasks to return."),
  includeDone: z.boolean().default(false).describe("Include completed tasks."),
})

interface TaskRow {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  created_at: string
}

export const listTasksTool = defineTool({
  name: "list_tasks",
  description: "List the user's tasks. Syncs from Google Tasks first to ensure freshness.",
  inputSchema: input,
  handler: async (args, ctx): Promise<TaskRow[]> => {
    // Pull from Google first (with 3s timeout)
    await Promise.race([
      pullFromGoogle(ctx.userId),
      new Promise((r) => setTimeout(r, 3000)),
    ])

    const db = getSupabaseAdmin()
    let query = db
      .from("tasks")
      .select("id, title, description, status, priority, due_date, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(args.limit)

    if (args.status) {
      query = query.eq("status", args.status)
    } else if (!args.includeDone) {
      query = query.in("status", ["inbox", "next", "doing", "waiting"])
    }

    const { data, error } = await query
    if (error) throw error
    return data ?? []
  },
})
