import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { tasksFor } from "./tasks-client"
import { loadTokens } from "./token-store"

// ── Helpers ─────────────────────────────────────────────────────────────────

async function hasGoogle(userId: string): Promise<boolean> {
  try {
    const t = await loadTokens(userId)
    return !!t
  } catch {
    return false
  }
}

/** Convert local due_date ISO string to Google Tasks RFC 3339 date-only format. */
function toGoogleDue(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  return iso.split("T")[0] + "T00:00:00.000Z"
}

/** Convert Google Tasks due string to ISO date string. */
function fromGoogleDue(due: string | null | undefined): string | null {
  if (!due) return null
  return new Date(due).toISOString()
}

// ── Push: Local → Google ────────────────────────────────────────────────────

interface LocalTask {
  id: string
  title: string
  description?: string | null
  status: string
  due_date?: string | null
  google_task_id?: string | null
  google_task_list_id?: string | null
}

export async function pushCreate(userId: string, task: LocalTask): Promise<void> {
  if (!(await hasGoogle(userId))) return

  try {
    const tasks = await tasksFor(userId)
    const taskListId = task.google_task_list_id || "@default"

    const requestBody: Record<string, string> = { title: task.title }
    if (task.description) requestBody.notes = task.description
    if (task.due_date) requestBody.due = toGoogleDue(task.due_date)!
    requestBody.status = task.status === "done" ? "completed" : "needsAction"

    const res = await tasks.tasks.insert({ tasklist: taskListId, requestBody })
    const googleId = res.data?.id
    if (!googleId) return

    const db = getSupabaseAdmin()
    await db
      .from("tasks")
      .update({ google_task_id: googleId, google_task_list_id: taskListId })
      .eq("id", task.id)
  } catch (e) {
    console.error("[task-sync] pushCreate failed:", e instanceof Error ? e.message : e)
  }
}

export async function pushUpdate(userId: string, task: LocalTask): Promise<void> {
  if (!task.google_task_id) return
  if (!(await hasGoogle(userId))) return

  try {
    const tasks = await tasksFor(userId)
    const taskListId = task.google_task_list_id || "@default"

    const requestBody: Record<string, string> = {
      title: task.title,
      status: task.status === "done" ? "completed" : "needsAction",
    }
    if (task.description !== undefined) requestBody.notes = task.description ?? ""
    if (task.due_date !== undefined) {
      const due = toGoogleDue(task.due_date)
      if (due) requestBody.due = due
    }

    await tasks.tasks.patch({
      tasklist: taskListId,
      task: task.google_task_id,
      requestBody,
    })
  } catch (e) {
    console.error("[task-sync] pushUpdate failed:", e instanceof Error ? e.message : e)
  }
}

export async function pushDelete(
  userId: string,
  googleTaskId: string,
  taskListId: string = "@default"
): Promise<void> {
  if (!(await hasGoogle(userId))) return

  try {
    const tasks = await tasksFor(userId)
    await tasks.tasks.delete({ tasklist: taskListId, task: googleTaskId })
  } catch (e) {
    console.error("[task-sync] pushDelete failed:", e instanceof Error ? e.message : e)
  }
}

// ── Pull: Google → Local ────────────────────────────────────────────────────

export async function pullFromGoogle(userId: string): Promise<void> {
  if (!(await hasGoogle(userId))) return

  try {
    const tasks = await tasksFor(userId)
    const taskListId = "@default"

    // Fetch all non-deleted tasks from Google (including completed)
    const res = await tasks.tasks.list({
      tasklist: taskListId,
      showCompleted: true,
      showHidden: true,
      maxResults: 100,
    })
    const googleTasks = res.data.items ?? []

    const db = getSupabaseAdmin()

    // Load all local tasks that have a google_task_id
    const { data: localSynced } = await db
      .from("tasks")
      .select("id, title, description, status, due_date, priority, google_task_id, google_task_list_id, updated_at")
      .eq("user_id", userId)
      .not("google_task_id", "is", null)

    const localByGoogleId = new Map(
      (localSynced ?? []).map((t) => [t.google_task_id, t])
    )

    const seenGoogleIds = new Set<string>()

    for (const gt of googleTasks) {
      if (!gt.id || gt.deleted) continue
      seenGoogleIds.add(gt.id)

      const local = localByGoogleId.get(gt.id)

      if (local) {
        // Existing synced task — update local if Google is newer
        const googleUpdated = gt.updated ? new Date(gt.updated) : new Date(0)
        const localUpdated = local.updated_at ? new Date(local.updated_at) : new Date(0)

        if (googleUpdated > localUpdated) {
          const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          }

          if (gt.title && gt.title !== local.title) updates.title = gt.title
          if (gt.notes !== undefined && gt.notes !== local.description) updates.description = gt.notes || null
          if (gt.due !== undefined) {
            const newDue = fromGoogleDue(gt.due)
            if (newDue !== local.due_date) updates.due_date = newDue
          }

          // Only change status if Google says completed
          if (gt.status === "completed" && local.status !== "done") {
            updates.status = "done"
          }
          // If Google says needsAction but local is done, reopen to inbox
          if (gt.status === "needsAction" && local.status === "done") {
            updates.status = "inbox"
          }

          if (Object.keys(updates).length > 1) {
            await db.from("tasks").update(updates).eq("id", local.id)
          }
        }
      } else {
        // New task from Google — create locally
        await db.from("tasks").insert({
          user_id: userId,
          title: gt.title || "(no title)",
          description: gt.notes || null,
          status: gt.status === "completed" ? "done" : "inbox",
          priority: "medium",
          due_date: fromGoogleDue(gt.due),
          created_from: "manual",
          google_task_id: gt.id,
          google_task_list_id: taskListId,
        })
      }
    }

    // Local tasks with google_task_id that no longer exist in Google → mark done
    for (const local of localSynced ?? []) {
      if (local.google_task_id && !seenGoogleIds.has(local.google_task_id) && local.status !== "done") {
        await db
          .from("tasks")
          .update({ status: "done", updated_at: new Date().toISOString() })
          .eq("id", local.id)
      }
    }
  } catch (e) {
    console.error("[task-sync] pullFromGoogle failed:", e instanceof Error ? e.message : e)
  }
}
