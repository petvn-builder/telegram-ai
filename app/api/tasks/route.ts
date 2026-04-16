import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { getSupabaseAdmin } from "@/lib/supabase/admin"
import { createTask } from "@/lib/tasks"
import type { CreateTaskInput } from "@/lib/tasks"
import { pullFromGoogle } from "@/lib/google/task-sync"

// ── GET /api/tasks ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Pull from Google Tasks in the background
    const syncWork = pullFromGoogle(user.id)
    try {
      const { waitUntil } = await import("@vercel/functions")
      waitUntil(syncWork)
    } catch {
      syncWork.catch(() => {})
    }

    const db = getSupabaseAdmin()
    const { searchParams } = new URL(req.url)
    const noteId = searchParams.get("note_id")
    const entityId = searchParams.get("entity_id")
    const status = searchParams.get("status")
    const month = searchParams.get("month") // e.g. "2026-03"

    // If filtering by entity, resolve task IDs first
    let entityTaskIds: string[] | null = null
    if (entityId) {
      const { data: rows } = await db
        .from("task_entities")
        .select("task_id")
        .eq("entity_id", entityId)
      entityTaskIds = (rows ?? []).map((r) => r.task_id)
      if (entityTaskIds.length === 0) return NextResponse.json([])
    }

    let query = db
      .from("tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (noteId) query = query.eq("linked_note_id", noteId)
    if (status) query = query.eq("status", status)
    if (entityTaskIds !== null) query = query.in("id", entityTaskIds)
    if (month) {
      const [y, m] = month.split("-").map(Number)
      const start = `${y}-${String(m).padStart(2, "0")}-01`
      const nextM = m === 12 ? 1 : m + 1
      const nextY = m === 12 ? y + 1 : y
      const end = `${nextY}-${String(nextM).padStart(2, "0")}-01`
      query = query.gte("due_date", start).lt("due_date", end).not("due_date", "is", null)
    }

    const { data: tasks, error } = await query
    if (error) throw error
    if (!tasks || tasks.length === 0) return NextResponse.json([])

    // Batch-load entities for all tasks (no N+1)
    const { data: teRows } = await db
      .from("task_entities")
      .select("task_id, entity_id")
      .in("task_id", tasks.map((t) => t.id))

    const uniqueEntityIds = [...new Set((teRows ?? []).map((r) => r.entity_id))]
    const entityMap = new Map<string, { id: string; name: string; type: string }>()

    if (uniqueEntityIds.length > 0) {
      const { data: entities } = await db
        .from("entities")
        .select("id, name, type")
        .in("id", uniqueEntityIds)
      for (const e of entities ?? []) entityMap.set(e.id, e)
    }

    const taskEntityIndex = new Map<string, Array<{ id: string; name: string; type: string }>>()
    for (const row of teRows ?? []) {
      const entity = entityMap.get(row.entity_id)
      if (!entity) continue
      if (!taskEntityIndex.has(row.task_id)) taskEntityIndex.set(row.task_id, [])
      taskEntityIndex.get(row.task_id)!.push(entity)
    }

    const result = tasks.map((task) => ({
      ...task,
      entities: taskEntityIndex.get(task.id) ?? [],
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error("Tasks GET error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}

// ── POST /api/tasks ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const authClient = await getSupabaseServer()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const title = (body.title ?? "").trim()
    if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 })

    const input: CreateTaskInput = {
      title,
      description: body.description,
      status: body.status,
      priority: body.priority,
      due_date: body.due_date ?? null,
      linked_note_id: body.linked_note_id ?? null,
      created_from: body.created_from ?? "manual",
    }

    const db = getSupabaseAdmin()
    const task = await createTask(db, user.id, input)
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error("Tasks POST error:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
