"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import useSWR from "swr"
import type { Entity, Space, NoteWithEntities, TaskWithEntities } from "./types"
import { fetcher } from "@/lib/fetcher"

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" })
}

function dateLabel(iso: string): string {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.getTime() === today.getTime()) return "Today"
  if (d.getTime() === yesterday.getTime()) return "Yesterday"
  const sameYear = d.getFullYear() === today.getFullYear()
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })
}

function titleAndBody(content: string): { title: string; body: string } {
  const trimmed = content.trim()
  const newlineIdx = trimmed.indexOf("\n")
  if (newlineIdx === -1) {
    return { title: trimmed.slice(0, 100), body: "" }
  }
  const title = trimmed.slice(0, newlineIdx).slice(0, 100)
  const body = trimmed.slice(newlineIdx + 1).trim().replace(/\n+/g, " ").slice(0, 140)
  return { title, body }
}

// Entity badge colors (vibrant, dark-mode adapted)
const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person:   { bg: "rgba(167,139,250,0.15)", text: "#A78BFA", border: "rgba(167,139,250,0.3)" },
  topic:    { bg: "rgba(96,165,250,0.15)",  text: "#60A5FA", border: "rgba(96,165,250,0.3)"  },
  project:  { bg: "rgba(129,140,248,0.15)", text: "#818CF8", border: "rgba(129,140,248,0.3)" },
  company:  { bg: "rgba(52,211,153,0.15)",  text: "#34D399", border: "rgba(52,211,153,0.3)"  },
  tool:     { bg: "rgba(251,191,36,0.15)",  text: "#FBBF24", border: "rgba(251,191,36,0.3)"  },
  goal:     { bg: "rgba(244,114,182,0.15)", text: "#F472B6", border: "rgba(244,114,182,0.3)" },
  event:    { bg: "rgba(248,113,113,0.15)", text: "#F87171", border: "rgba(248,113,113,0.3)" },
  resource: { bg: "rgba(45,212,191,0.15)",  text: "#2DD4BF", border: "rgba(45,212,191,0.3)"  },
}

function entityStyle(type: string) {
  return ENTITY_COLORS[type] ?? { bg: "rgba(167,139,250,0.15)", text: "#A78BFA", border: "rgba(167,139,250,0.3)" }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div className="skeleton" style={{ height: "15px", borderRadius: "6px", width: "65%" }} />
      <div className="skeleton" style={{ height: "13px", borderRadius: "6px", width: "85%" }} />
      <div className="skeleton" style={{ height: "11px", borderRadius: "6px", width: "100px" }} />
    </div>
  )
}

interface NoteCardProps {
  note: NoteWithEntities
  selected: boolean
  onClick: () => void
  isLast: boolean
}

function NoteCard({ note, selected, onClick, isLast }: NoteCardProps) {
  const [hovered, setHovered] = useState(false)
  const { title, body } = titleAndBody(note.content)
  const spaceName = note.spaces?.[0]?.name ?? null

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%",
        textAlign: "left",
        background: selected ? "var(--accent-dim)" : hovered ? "var(--bg-hover)" : "transparent",
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        borderTop: "none",
        borderRight: "none",
        borderLeft: "none",
        borderRadius: "0",
        padding: "18px 24px",
        cursor: "pointer",
        transition: "background 0.15s ease, border-color 0.15s ease",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
      }}
    >
      <p style={{ fontSize: "14px", fontWeight: 500, lineHeight: 1.4, color: "var(--text-1)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {title || "Untitled"}
      </p>
      {body && (
        <p style={{ fontSize: "13px", lineHeight: 1.5, color: "var(--text-2)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {body}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}>
        {spaceName && (
          <>
            <span style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 500 }}>@{spaceName}</span>
            <span style={{ fontSize: "11px", color: "var(--text-3)" }}>·</span>
          </>
        )}
        <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-geist-mono, monospace)" }}>
          {relativeTime(note.created_at)}
        </span>
      </div>
    </button>
  )
}

// ── EntityTag (filter row) ─────────────────────────────────────────────────────

interface EntityTagProps { label: string; count: number; active: boolean; onClick: () => void }

function EntityTag({ label, count, active, onClick }: EntityTagProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: "4px",
        padding: "5px 11px", borderRadius: "999px", fontSize: "13px", fontWeight: 500,
        whiteSpace: "nowrap", flexShrink: 0, cursor: "pointer",
        background: active ? "var(--accent-dim)" : hovered ? "var(--bg-elevated)" : "var(--bg-hover)",
        border: active ? "1px solid var(--border-accent)" : "1px solid transparent",
        color: active ? "var(--accent)" : "var(--text-2)",
        transition: "background 0.15s ease, color 0.15s ease",
      }}
    >
      {label}
      <span style={{ fontSize: "11px", opacity: 0.6 }}>{count}</span>
    </button>
  )
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DETAIL_W_DEFAULT = 560
const DETAIL_W_MIN = 360
const DETAIL_W_MAX = 900

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NotesPage() {
  return <Suspense><NotesPageInner /></Suspense>
}

function NotesPageInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeSpaceId = searchParams.get("space")
  const openNoteId = searchParams.get("open")
  const composeParam = searchParams.get("compose")

  // ── Core data
  const [offset, setOffset] = useState(0)
  const [accumulatedNotes, setAccumulatedNotes] = useState<NoteWithEntities[]>([])
  const [selectedNote, setSelectedNote] = useState<NoteWithEntities | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeEntityId, setActiveEntityId] = useState<string | null>(searchParams.get("entity"))
  const [groupByEntity, setGroupByEntity] = useState(false)
  const [listFading, setListFading] = useState(false)

  // ── Panel
  const [panelMode, setPanelMode] = useState<"create" | "edit" | null>(null)
  const [panelText, setPanelText] = useState("")
  const [panelSaving, setPanelSaving] = useState(false)
  const [panelSaved, setPanelSaved] = useState(false)
  const [panelDirty, setPanelDirty] = useState(false)
  const [panelCreating, setPanelCreating] = useState(false)

  // ── Panel spaces
  const [panelSpaces, setPanelSpaces] = useState<Space[]>([])
  const [showSpaceInput, setShowSpaceInput] = useState(false)
  const [spaceInput, setSpaceInput] = useState("")
  const [creatingSpace, setCreatingSpace] = useState(false)

  // ── Panel tasks
  const [noteTasks, setNoteTasks] = useState<TaskWithEntities[]>([])
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDue, setTaskDue] = useState("")

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTaskTitle, setEditingTaskTitle] = useState("")
  const [pendingTasks, setPendingTasks] = useState<{ title: string; due_date: string | null }[]>([])

  // ── Panel delete
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Panel width (resizable)
  const [panelWidth, setPanelWidth] = useState(DETAIL_W_DEFAULT)
  const isResizing = useRef(false)
  const resizeStartX = useRef(0)
  const resizeStartW = useRef(0)

  // ── Refs
  const detailRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const justAddedId = useRef<string | null>(null)
  const confirmDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelSpacesRef = useRef<Space[]>([])
  const panelTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Keep ref in sync with state
  useEffect(() => { panelSpacesRef.current = panelSpaces }, [panelSpaces])

  // ── SWR: notes (paginated) + spaces (shared cache)
  const notesKey = `/api/notes?${activeSpaceId ? `spaceId=${activeSpaceId}&` : ""}preview=1&limit=30&offset=${offset}`
  const { data: notesPage, isLoading: loading, error: notesError, mutate: mutateNotes } =
    useSWR<{ notes: NoteWithEntities[]; total: number; hasMore: boolean; offset: number }>(
      notesKey, fetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 }
    )
  const { data: allSpaces = [], mutate: mutateSpaces } =
    useSWR<Space[]>("/api/spaces", fetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 })

  const error = (notesError as Error | undefined)?.message ?? null
  const hasMore = notesPage?.hasMore ?? false
  const notes = accumulatedNotes

  const activeSpaceName = useMemo(
    () => allSpaces.find((s) => s.id === activeSpaceId)?.name ?? null,
    [activeSpaceId, allSpaces]
  )

  // Reset pagination and panel when space filter changes
  useEffect(() => {
    setOffset(0)
    setAccumulatedNotes([])
    setSelectedNote(null)
    setPanelMode(null)
  }, [activeSpaceId])

  // Merge SWR pages into the accumulated notes list
  useEffect(() => {
    if (!notesPage) return
    if (notesPage.offset === 0) {
      setAccumulatedNotes(notesPage.notes)
    } else {
      setAccumulatedNotes((prev) => [...prev, ...notesPage.notes])
    }
  }, [notesPage])

  useEffect(() => {
    setActiveEntityId(searchParams.get("entity"))
  }, [searchParams])

  // Open note in panel when navigated with ?open=NOTE_ID
  useEffect(() => {
    if (!openNoteId || loading || notes.length === 0) return
    const note = notes.find((n) => n.id === openNoteId)
    if (note) {
      setSelectedNote(note)
      setPanelMode("edit")
      router.replace("/notes", { scroll: false })
    }
  }, [openNoteId, loading, notes]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open compose panel when navigated with ?compose=1
  useEffect(() => {
    if (composeParam !== "1") return
    setSelectedNote(null)
    setPanelText(searchParams.get("text") ?? "")
    setPanelSpaces([])
    setPanelSaved(false)
    setPanelDirty(false)
    setPanelMode("create")
    router.replace("/notes", { scroll: false })
  }, [composeParam]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Panel open/close effects
  useEffect(() => {
    if (panelMode !== null && detailRef.current) {
      detailRef.current.classList.remove("panel-slide-in")
      void detailRef.current.offsetWidth
      detailRef.current.classList.add("panel-slide-in")
    }
    if (panelMode === null) {
      setShowSpaceInput(false)
      setSpaceInput("")
    }
    setConfirmDelete(false)
    setDeleting(false)
  }, [panelMode])

  // When selected note changes (edit mode)
  useEffect(() => {
    if (!selectedNote) return
    setPanelText(selectedNote.content)
    setPanelSpaces(selectedNote.spaces ?? [])
    setPanelSaved(false)
    setPanelDirty(false)
    setTaskTitle("")
    setTaskDue("")
    setNoteTasks([])
    setShowSpaceInput(false)
    setSpaceInput("")
    fetch(`/api/tasks?note_id=${selectedNote.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setNoteTasks)
      .catch(() => {})
    // Auto-focus textarea after transition
    setTimeout(() => panelTextareaRef.current?.focus(), 220)
  }, [selectedNote?.id])

  // Auto-focus when opening create mode
  useEffect(() => {
    if (panelMode === "create") {
      setTimeout(() => panelTextareaRef.current?.focus(), 220)
    }
  }, [panelMode])

  // Cleanup save timer
  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  async function doSave(text: string, spaces: Space[]) {
    if (!selectedNote) return
    setPanelSaving(true)
    try {
      const res = await fetch(`/api/notes/${selectedNote.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, spaces: spaces.map((s) => s.name) }),
      })
      if (res.ok) {
        const updated: NoteWithEntities = await res.json()
        setAccumulatedNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)))
        mutateNotes((current) => current ? { ...current, notes: current.notes.map((n) => n.id === updated.id ? updated : n) } : current, false)
        setSelectedNote(updated)
        setPanelSaved(true)
      }
    } finally {
      setPanelSaving(false)
    }
  }

  // ── Create note
  async function handleCreateNote() {
    if (!panelText.trim() || panelCreating) return
    setPanelCreating(true)
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: panelText, spaces: panelSpaces.map((s) => s.name) }),
      })
      if (res.ok) {
        const note: NoteWithEntities = await res.json()
        justAddedId.current = note.id
        setAccumulatedNotes((prev) => [note, ...prev])
        mutateNotes((current) => current ? { ...current, notes: [note, ...current.notes], total: current.total + 1 } : current, false)
        // Post any pending tasks linked to the new note
        if (pendingTasks.length > 0) {
          const results = await Promise.all(
            pendingTasks.map((pt) =>
              fetch("/api/tasks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: pt.title, due_date: pt.due_date, linked_note_id: note.id, status: "inbox" }),
              }).then((r) => r.ok ? r.json() : null)
            )
          )
          setNoteTasks(results.filter(Boolean))
          setPendingTasks([])
        }
        setSelectedNote(note)
        setPanelMode("edit")
      }
    } finally {
      setPanelCreating(false)
    }
  }

  // ── Delete note
  async function handleDelete() {
    if (!selectedNote || deleting) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      confirmDeleteTimerRef.current = setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    if (confirmDeleteTimerRef.current) clearTimeout(confirmDeleteTimerRef.current)
    setDeleting(true)
    try {
      const res = await fetch(`/api/notes/${selectedNote.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      const deletedId = selectedNote.id
      setAccumulatedNotes((prev) => prev.filter((n) => n.id !== deletedId))
      mutateNotes((current) => current ? { ...current, notes: current.notes.filter((n) => n.id !== deletedId), total: current.total - 1 } : current, false)
      setSelectedNote(null)
      setPanelMode(null)
    } catch {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  // ── Tasks (optimistic — clears inputs + adds to list instantly, POSTs in background)
  function handleAddTask() {
    const title = taskTitle.trim()
    const due = taskDue || null
    if (!title) return

    // Clear inputs immediately
    setTaskTitle("")
    setTaskDue("")

    if (panelMode === "create") {
      setPendingTasks((prev) => [...prev, { title, due_date: due }])
      return
    }

    if (!selectedNote) return

    // Add to list instantly with temp ID
    const tempId = `temp-${Date.now()}`
    const now = new Date().toISOString()
    const tempTask: TaskWithEntities = {
      id: tempId,
      user_id: "",
      title,
      description: null,
      due_date: due ? new Date(due).toISOString() : null,
      status: "inbox",
      priority: "medium",
      linked_note_id: selectedNote.id,
      created_from: "note",
      telegram_message_id: null,
      created_at: now,
      updated_at: now,
      entities: [],
    }
    setNoteTasks((prev) => [...prev, tempTask])

    // Background POST
    fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        due_date: due ? new Date(due).toISOString() : null,
        linked_note_id: selectedNote.id,
        status: "inbox",
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((saved: TaskWithEntities) => {
        setNoteTasks((prev) => prev.map((t) => (t.id === tempId ? saved : t)))
      })
      .catch(() => {
        // Remove failed optimistic task
        setNoteTasks((prev) => prev.filter((t) => t.id !== tempId))
      })
  }

  async function handleSaveTaskTitle(taskId: string) {
    const title = editingTaskTitle.trim()
    setEditingTaskId(null)
    if (!title) return
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    if (res.ok) {
      setNoteTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, title } : t))
    }
  }

  async function handleToggleTask(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === "done" ? "inbox" : "done"
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setNoteTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus as TaskWithEntities["status"] } : t))
    }
  }

  // ── Spaces management
  function handleAddSpace(space: Space) {
    if (panelSpaces.some((s) => s.id === space.id)) return
    const newSpaces = [...panelSpaces, space]
    setPanelSpaces(newSpaces)
    setShowSpaceInput(false)
    setSpaceInput("")
    if (panelMode === "edit" && selectedNote) {
      doSave(panelText, newSpaces)
    }
  }

  function handleRemoveSpace(spaceId: string) {
    const newSpaces = panelSpaces.filter((s) => s.id !== spaceId)
    setPanelSpaces(newSpaces)
    if (panelMode === "edit" && selectedNote) {
      doSave(panelText, newSpaces)
    }
  }

  async function handleCreateSpace(name: string) {
    if (!name.trim() || creatingSpace) return
    setCreatingSpace(true)
    try {
      const res = await fetch("/api/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (res.ok) {
        const space: Space = await res.json()
        mutateSpaces((prev = []) => [...prev, space], false)
        handleAddSpace(space)
      }
    } finally {
      setCreatingSpace(false)
    }
  }

  // ── Note list interactions
  function handleNoteClick(note: NoteWithEntities) {
    if (selectedNote?.id === note.id && panelMode === "edit") {
      setSelectedNote(null)
      setPanelMode(null)
      return
    }
    setSelectedNote(note)
    setPanelMode("edit")
  }

  function openCreatePanel() {
    setSelectedNote(null)
    setPanelText("")
    setPanelSpaces([])
    setPanelSaved(false)
    setPendingTasks([])
    setNoteTasks([])
    setTaskTitle("")
    setTaskDue("")
    setPanelMode("create")
  }

  function closePanel() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    setSelectedNote(null)
    setPanelMode(null)
  }

  // ── Panel resize
  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    isResizing.current = true
    resizeStartX.current = e.clientX
    resizeStartW.current = panelWidth

    function onMove(ev: MouseEvent) {
      if (!isResizing.current) return
      const delta = resizeStartX.current - ev.clientX // drag left = wider
      setPanelWidth(Math.max(DETAIL_W_MIN, Math.min(DETAIL_W_MAX, resizeStartW.current + delta)))
    }
    function onUp() {
      isResizing.current = false
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  // ── Filter/group helpers
  function setEntityFilter(entityId: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (entityId) params.set("entity", entityId)
    else params.delete("entity")
    router.push(`/notes?${params}`, { scroll: false })
    setActiveEntityId(entityId)
    scrollContainerRef.current?.scrollTo({ top: 0 })
  }

  function toggleGroupMode() {
    setListFading(true)
    setTimeout(() => { setGroupByEntity((prev) => !prev); setListFading(false) }, 120)
  }

  // ── Memos
  const entityStats = useMemo(() => {
    const map = new Map<string, { entity: Entity; count: number; notes: NoteWithEntities[] }>()
    for (const note of notes) {
      for (const entity of note.entities) {
        const entry = map.get(entity.id)
        if (entry) { entry.count++; entry.notes.push(note) }
        else map.set(entity.id, { entity, count: 1, notes: [note] })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [notes])

  const filteredNotes = useMemo(() => {
    let result = notes
    if (searchQuery) result = result.filter((n) => n.content.toLowerCase().includes(searchQuery.toLowerCase()))
    if (activeEntityId) result = result.filter((n) => n.entities.some((e) => e.id === activeEntityId))
    return result
  }, [notes, searchQuery, activeEntityId])

  const spaceQuery = spaceInput.replace(/^@/, "").trim()

  const filteredSpaceDropdown = useMemo(() =>
    allSpaces.filter((s) =>
      !panelSpaces.some((ps) => ps.id === s.id) &&
      s.name.toLowerCase().includes(spaceQuery.toLowerCase())
    ),
    [allSpaces, panelSpaces, spaceQuery]
  )

  const canCreateSpace = spaceQuery.length > 0 &&
    !allSpaces.some((s) => s.name.toLowerCase() === spaceQuery.toLowerCase())

  // ── Render helpers
  function renderCards(items: NoteWithEntities[]) {
    return items.map((note, idx) => {
      const isNew = note.id === justAddedId.current
      return (
        <div key={note.id} style={isNew ? { animation: "fadeInUp 180ms ease-in-out both" } : undefined}
          onAnimationEnd={() => { if (isNew) justAddedId.current = null }}>
          <NoteCard note={note} selected={selectedNote?.id === note.id && panelMode === "edit"}
            onClick={() => handleNoteClick(note)} isLast={idx === items.length - 1} />
        </div>
      )
    })
  }

  function renderCardsWithDates(items: NoteWithEntities[]) {
    const result: React.ReactNode[] = []
    let lastLabel = ""
    items.forEach((note, idx) => {
      const label = dateLabel(note.created_at)
      if (label !== lastLabel) {
        lastLabel = label
        result.push(
          <div key={`date-${label}`} style={{ padding: "10px 24px 6px", fontSize: "11px", fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "var(--font-geist-mono, monospace)" }}>
            {label}
          </div>
        )
      }
      const isNew = note.id === justAddedId.current
      result.push(
        <div key={note.id} style={isNew ? { animation: "fadeInUp 180ms ease-in-out both" } : undefined}
          onAnimationEnd={() => { if (isNew) justAddedId.current = null }}>
          <NoteCard note={note} selected={selectedNote?.id === note.id && panelMode === "edit"}
            onClick={() => handleNoteClick(note)} isLast={idx === items.length - 1} />
        </div>
      )
    })
    return result
  }

  function renderGrouped() {
    return entityStats.map(({ entity, notes: entityNotes }) => {
      if (activeEntityId && activeEntityId !== entity.id) return null
      const items = searchQuery ? entityNotes.filter((n) => n.content.toLowerCase().includes(searchQuery.toLowerCase())) : entityNotes
      if (items.length === 0) return null
      return (
        <div key={entity.id}>
          <div style={{ position: "sticky", top: 0, background: "var(--bg-base)", zIndex: 2, padding: "12px 24px 8px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "baseline", gap: "6px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-1)" }}>{entity.name}</span>
            <span style={{ fontSize: "13px", color: "var(--text-3)" }}>({items.length})</span>
          </div>
          {renderCards(items)}
        </div>
      )
    })
  }

  function renderMain() {
    if (loading) return (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    )
    if (error) return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "#FF453A", fontSize: "14px" }}>
        {error}
      </div>
    )
    if (filteredNotes.length === 0) {
      const activeEntityName = activeEntityId ? entityStats.find((s) => s.entity.id === activeEntityId)?.entity.name : null
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "300px", gap: "12px" }}>
          <span style={{ fontSize: "24px", opacity: 0.25, color: "var(--text-3)" }}>◌</span>
          <p style={{ fontSize: "14px", margin: 0, color: "var(--text-2)" }}>
            {activeEntityName ? `No notes linked to ${activeEntityName} yet`
              : searchQuery ? "No notes match your search"
              : activeSpaceId ? `No notes in ${activeSpaceName ? `@${activeSpaceName}` : "this space"} yet`
              : "No notes yet"}
          </p>
          {!searchQuery && !activeSpaceId && !activeEntityName && (
            <p style={{ fontSize: "13px", margin: 0, color: "var(--text-3)" }}>
              Use{" "}
              <code style={{ fontFamily: "var(--font-geist-mono, monospace)", background: "var(--bg-surface)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: "4px" }}>
                /save
              </code>{" "}
              in Telegram or click + New
            </p>
          )}
        </div>
      )
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", opacity: listFading ? 0 : 1, transition: "opacity 150ms ease-in-out" }}>
        {groupByEntity ? renderGrouped() : renderCardsWithDates(filteredNotes)}
        {!groupByEntity && hasMore && !searchQuery && !activeEntityId && (
          <button
            onClick={() => setOffset((o) => o + 30)}
            style={{ padding: "12px 24px", background: "transparent", border: "none", color: "var(--text-3)", fontSize: "13px", cursor: "pointer", textAlign: "left", transition: "color 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-2)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
          >
            Load more
          </button>
        )}
      </div>
    )
  }

  // ── Layout
  const showEntityTags = !loading && entityStats.length > 0
  const panelOpen = panelMode !== null
  const tasksDone = noteTasks.filter((t) => t.status === "done").length
  const tasksTotal = panelMode === "create" ? pendingTasks.length : noteTasks.length

  // ── Icon buttons shared style
  const iconBtnStyle: React.CSSProperties = {
    width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center",
    background: "transparent", border: "none", borderRadius: "8px", cursor: "pointer",
    color: "var(--text-2)", transition: "background 0.15s ease, color 0.15s ease",
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-base)", overflow: "hidden", position: "relative" }}>

      {/* ── Content column ── */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
        transition: "padding-right 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
        paddingRight: panelOpen ? `${panelWidth}px` : "0",
      }}>
        {/* Page header */}
        <div style={{ padding: "28px 32px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: showEntityTags ? "16px" : "20px" }}>
            {/* Title / breadcrumb */}
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              {activeSpaceId ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                  <Link href="/notes" style={{ fontSize: "19px", fontWeight: 500, color: "var(--text-3)", textDecoration: "none", letterSpacing: "-0.015em", transition: "color 0.15s" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-2)" }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-3)" }}>
                    Notes
                  </Link>
                  <span style={{ fontSize: "16px", color: "var(--text-3)" }}>/</span>
                  <span style={{ fontSize: "19px", fontWeight: 500, color: "var(--accent)", letterSpacing: "-0.015em" }}>
                    {activeSpaceName ? `@${activeSpaceName}` : "Space"}
                  </span>
                </div>
              ) : (
                <h1 style={{ fontSize: "19px", fontWeight: 600, color: "var(--text-1)", margin: 0, letterSpacing: "-0.02em" }}>Notes</h1>
              )}
            </div>

            {/* Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
              {/* Group toggle */}
              <button onClick={toggleGroupMode} title={groupByEntity ? "Ungroup" : "Group by entity"}
                style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 12px", background: groupByEntity ? "var(--accent-dim)" : "transparent", border: groupByEntity ? "1px solid var(--border-accent)" : "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", color: groupByEntity ? "var(--accent)" : "var(--text-2)", fontSize: "13px", transition: "all 0.15s ease" }}
                onMouseEnter={(e) => { if (!groupByEntity) { e.currentTarget.style.color = "var(--text-1)"; e.currentTarget.style.borderColor = "var(--border-hover)" } }}
                onMouseLeave={(e) => { if (!groupByEntity) { e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.borderColor = "var(--border)" } }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="1" width="6" height="6" rx="1" /><rect x="9" y="1" width="6" height="6" rx="1" />
                  <rect x="1" y="9" width="6" height="6" rx="1" /><rect x="9" y="9" width="6" height="6" rx="1" />
                </svg>
                Group
              </button>

              {/* Search */}
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", fontSize: "13px", pointerEvents: "none", lineHeight: 1 }}>⌕</span>
                <input type="text" placeholder="Search…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: "180px", background: "transparent", border: "1px solid transparent", borderRadius: "8px", padding: "6px 12px 6px 28px", fontSize: "13px", color: "var(--text-1)", outline: "none", transition: "border-color 0.15s, background 0.15s", boxSizing: "border-box" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-surface)" }}
                  onBlur={(e) => { if (!e.currentTarget.value) { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "transparent" } }} />
              </div>

              {/* New note */}
              <button onClick={openCreatePanel} title="New note"
                style={{ display: "flex", alignItems: "center", gap: "5px", padding: "6px 14px", background: panelMode === "create" ? "var(--accent-dim)" : "transparent", border: panelMode === "create" ? "1px solid var(--border-accent)" : "1px solid var(--border)", borderRadius: "8px", cursor: "pointer", color: panelMode === "create" ? "var(--accent)" : "var(--text-2)", fontSize: "13px", fontWeight: 500, transition: "all 0.15s ease" }}
                onMouseEnter={(e) => { if (panelMode !== "create") { e.currentTarget.style.color = "var(--text-1)"; e.currentTarget.style.borderColor = "var(--border-hover)" } }}
                onMouseLeave={(e) => { if (panelMode !== "create") { e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.borderColor = "var(--border)" } }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New
              </button>
            </div>
          </div>

          {/* Entity tags row */}
          {showEntityTags && (
            <div style={{ position: "relative", marginBottom: "16px" }}>
              <div className="entity-tags-scroll" style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
                <EntityTag label="All" count={notes.length} active={activeEntityId === null} onClick={() => setEntityFilter(null)} />
                {entityStats.map(({ entity, count }) => (
                  <EntityTag key={entity.id} label={entity.name} count={count} active={activeEntityId === entity.id}
                    onClick={() => setEntityFilter(activeEntityId === entity.id ? null : entity.id)} />
                ))}
              </div>
              <div style={{ position: "absolute", right: 0, top: 0, bottom: "2px", width: "48px", background: "linear-gradient(to right, transparent, var(--bg-base))", pointerEvents: "none" }} />
            </div>
          )}

          <div style={{ height: "1px", background: "var(--border-subtle)" }} />
        </div>

        {/* Cards scroll area */}
        <div ref={scrollContainerRef} style={{ flex: 1, overflowY: "auto", padding: "0 32px 32px" }}>
          <div style={{ maxWidth: "680px" }}>
            {renderMain()}
          </div>
        </div>
      </div>

      {/* ── Detail / Create panel ── */}
      {panelOpen && (
        <div ref={detailRef} className="panel-slide-in" style={{
          position: "fixed", top: 0, right: 0, bottom: 0, width: panelWidth,
          background: "var(--bg-surface)", borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column", zIndex: 40,
        }}>
          {/* Drag-to-resize handle */}
          <div
            onMouseDown={handleResizeStart}
            style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: "6px",
              cursor: "col-resize", zIndex: 1, transition: "background 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-dim)" }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
          />

          {/* ── A. Toolbar ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 18px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <span style={{ fontSize: "12px", color: "var(--text-3)", fontFamily: "var(--font-geist-mono, monospace)" }}>
              {panelMode === "edit" && selectedNote ? relativeTime(selectedNote.created_at) : "New note"}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              {/* Open full-page (edit only) */}
              {panelMode === "edit" && selectedNote && (
                <Link href={`/notes/${selectedNote.id}`} title="Open full page"
                  style={{ ...iconBtnStyle, textDecoration: "none" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text-1)" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-2)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </Link>
              )}
              {/* Delete (edit only) */}
              {panelMode === "edit" && selectedNote && (
                <button onClick={handleDelete} disabled={deleting} title={confirmDelete ? "Click again to confirm" : "Delete note"}
                  style={{ ...iconBtnStyle, color: confirmDelete ? "#FF453A" : "var(--text-2)", opacity: deleting ? 0.5 : 1, cursor: deleting ? "not-allowed" : "pointer" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,69,58,0.1)"; e.currentTarget.style.color = "#FF453A" }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = confirmDelete ? "#FF453A" : "var(--text-2)" }}>
                  {deleting ? (
                    <span style={{ fontSize: "12px", color: "var(--text-3)" }}>…</span>
                  ) : confirmDelete ? (
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#FF453A", whiteSpace: "nowrap" }}>Delete?</span>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  )}
                </button>
              )}
              {/* Close */}
              <button onClick={closePanel} title="Close"
                style={iconBtnStyle}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-1)" }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-2)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div style={{ flex: 1, overflowY: "auto" }}>

            {/* ── B. Note writing area ── */}
            <div style={{ padding: "24px 24px 12px" }}>
              <textarea
                ref={(el) => {
                  panelTextareaRef.current = el
                  if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px" }
                }}
                value={panelText}
                placeholder="What's on your mind…"
                onChange={(e) => {
                  const val = e.target.value
                  setPanelText(val)
                  e.target.style.height = "auto"
                  e.target.style.height = e.target.scrollHeight + "px"
                  if (panelMode === "edit") {
                    setPanelDirty(true)
                    setPanelSaved(false)
                    // Debounced auto-save — 1.2s after last keystroke
                    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
                    saveTimerRef.current = setTimeout(() => {
                      doSave(val, panelSpacesRef.current)
                      setPanelDirty(false)
                    }, 1200)
                  }
                }}
                style={{
                  width: "100%", resize: "none", border: "none", outline: "none",
                  fontSize: "15px", lineHeight: 1.75, color: "var(--text-1)",
                  background: "transparent", padding: 0, boxSizing: "border-box",
                  minHeight: "180px", overflow: "hidden",
                  fontFamily: "Georgia, Merriweather, serif",
                }}
              />
            </div>

            {/* ── C. Tasks section ── */}
            {panelMode !== null && (
              <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", fontFamily: "var(--font-geist-mono, monospace)" }}>
                      Tasks
                    </span>
                    {tasksTotal > 0 && (
                      <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-geist-mono, monospace)" }}>
                        {panelMode === "create" ? tasksTotal : `${tasksDone}/${tasksTotal}`}
                      </span>
                    )}
                  </div>
                  {panelMode === "edit" && (
                    <Link href="/tasks" style={{ fontSize: "12px", color: "var(--accent)", textDecoration: "none", transition: "opacity 0.15s" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7" }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}>
                      Tasks →
                    </Link>
                  )}
                </div>

                {/* Pending task rows (create mode) */}
                {panelMode === "create" && pendingTasks.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", marginBottom: "14px" }}>
                    {pendingTasks.map((pt, idx) => (
                      <div key={idx} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border-subtle)", gap: "10px" }}>
                        <span style={{ fontSize: "13px", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                          {pt.title}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                          {pt.due_date && (
                            <span style={{ fontSize: "11px", color: "var(--text-3)", fontFamily: "var(--font-geist-mono, monospace)" }}>
                              {shortDate(pt.due_date)}
                            </span>
                          )}
                          <button onClick={() => setPendingTasks((prev) => prev.filter((_, i) => i !== idx))}
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", fontSize: "14px", lineHeight: 1, padding: "2px", borderRadius: "4px", transition: "color 0.15s" }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "#FF453A" }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}>
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Real task rows (edit mode) */}
                {panelMode === "edit" && noteTasks.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", marginBottom: "14px" }}>
                    {noteTasks.map((task) => {
                      const done = task.status === "done"
                      return (
                        <div key={task.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border-subtle)", gap: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                            {/* Checkbox */}
                            <button onClick={() => handleToggleTask(task.id, task.status)}
                              style={{ width: "18px", height: "18px", borderRadius: "5px", border: `1.5px solid ${done ? "var(--accent)" : "var(--text-3)"}`, background: done ? "var(--accent)" : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s ease" }}>
                              {done && (
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="2 6 5 9 10 3" />
                                </svg>
                              )}
                            </button>
                            {editingTaskId === task.id ? (
                              <input
                                autoFocus
                                value={editingTaskTitle}
                                onChange={(e) => setEditingTaskTitle(e.target.value)}
                                onBlur={() => handleSaveTaskTitle(task.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveTaskTitle(task.id)
                                  if (e.key === "Escape") setEditingTaskId(null)
                                }}
                                style={{ fontSize: "13px", color: "var(--text-1)", background: "transparent", border: "none", outline: "none", padding: 0, width: "100%", fontFamily: "inherit" }}
                              />
                            ) : (
                              <span
                                onClick={() => { setEditingTaskId(task.id); setEditingTaskTitle(task.title) }}
                                title="Click to edit"
                                style={{ fontSize: "13px", color: done ? "var(--text-3)" : "var(--text-1)", textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", transition: "color 0.15s", cursor: "text" }}>
                                {task.title}
                              </span>
                            )}
                          </div>
                          {task.due_date && (
                            <span style={{ fontSize: "11px", color: "var(--text-3)", flexShrink: 0, fontFamily: "var(--font-geist-mono, monospace)" }}>
                              {shortDate(task.due_date)}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Quick-add — save on Enter, +Add click, or blur away from the area */}
                <div
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node) && taskTitle.trim()) {
                      handleAddTask()
                    }
                  }}
                  style={{ display: "flex", flexDirection: "column", gap: "6px" }}
                >
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input type="text" placeholder="Add a task…" value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddTask() }}
                      style={{ flex: 1, border: "1px solid var(--border)", borderRadius: "8px", padding: "7px 10px", fontSize: "13px", color: "var(--text-1)", background: "var(--bg-surface)", outline: "none", fontFamily: "inherit", transition: "border-color 0.15s" }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)" }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }} />
                    <input type="date" value={taskDue}
                      onChange={(e) => setTaskDue(e.target.value)}
                      style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "7px 8px", fontSize: "12px", background: "var(--bg-surface)", color: taskDue ? "var(--text-1)" : "var(--text-3)", outline: "none", fontFamily: "inherit", width: "110px", flexShrink: 0 }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={handleAddTask} disabled={!taskTitle.trim()}
                      style={{ fontSize: "12px", color: taskTitle.trim() ? "var(--accent)" : "var(--text-3)", background: "transparent", border: "1px solid var(--border-accent)", borderRadius: "7px", padding: "5px 12px", cursor: taskTitle.trim() ? "pointer" : "default", transition: "opacity 0.15s", opacity: taskTitle.trim() ? 1 : 0.4 }}
                      onMouseEnter={(e) => { if (taskTitle.trim()) e.currentTarget.style.opacity = "0.7" }}
                      onMouseLeave={(e) => { if (taskTitle.trim()) e.currentTarget.style.opacity = "1" }}>
                      + Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ── D. Spaces section ── */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border-subtle)", position: "relative" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", fontFamily: "var(--font-geist-mono, monospace)", display: "block", marginBottom: "10px" }}>
                Spaces
              </span>

              {/* Space pills */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: panelSpaces.length > 0 ? "10px" : "0" }}>
                {panelSpaces.map((s) => (
                  <span key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px 3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 500, background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid var(--border-accent)" }}>
                    @{s.name}
                    <button onClick={() => handleRemoveSpace(s.id)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer", color: "var(--accent)", opacity: 0.6, padding: "0", borderRadius: "50%", width: "14px", height: "14px", transition: "opacity 0.15s" }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1" }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.6" }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>

              {/* Add space button */}
              <button onClick={() => { setShowSpaceInput((v) => !v); setSpaceInput("") }}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", color: showSpaceInput ? "var(--accent)" : "var(--text-3)", background: "transparent", border: `1px dashed ${showSpaceInput ? "var(--border-accent)" : "var(--border)"}`, cursor: "pointer", transition: "color 0.15s, border-color 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--accent)"; e.currentTarget.style.borderColor = "var(--border-accent)" }}
                onMouseLeave={(e) => { if (!showSpaceInput) { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.borderColor = "var(--border)" } }}>
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>@</span>
                Add space
              </button>

              {/* Dropdown */}
              {showSpaceInput && (
                <div style={{ position: "absolute", left: "24px", right: "24px", top: "100%", marginTop: "4px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: "10px", boxShadow: "var(--shadow-lg)", zIndex: 50, overflow: "hidden" }}>
                  <div style={{ padding: "10px 10px 8px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: "14px", flexShrink: 0 }}>@</span>
                    <input type="text" placeholder="space name…" value={spaceInput.replace(/^@/, "")} onChange={(e) => setSpaceInput(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Escape") { setShowSpaceInput(false); setSpaceInput("") }
                        if (e.key === "Enter" && canCreateSpace) handleCreateSpace(spaceQuery)
                      }}
                      style={{ flex: 1, background: "transparent", border: "none", padding: "4px 0", fontSize: "13px", color: "var(--text-1)", outline: "none" }} />
                  </div>
                  <div style={{ maxHeight: "180px", overflowY: "auto", borderTop: "1px solid var(--border-subtle)" }}>
                    {filteredSpaceDropdown.map((space) => (
                      <button key={space.id} onClick={() => handleAddSpace(space)}
                        style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: "14px", color: "var(--text-1)", transition: "background 0.12s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}>
                        <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: "13px" }}>@</span>
                        {space.name}
                      </button>
                    ))}
                    {canCreateSpace && (
                      <button onClick={() => handleCreateSpace(spaceQuery)} disabled={creatingSpace}
                        style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px", background: "transparent", border: "none", cursor: "pointer", fontSize: "14px", color: "var(--text-2)", transition: "background 0.12s", borderTop: filteredSpaceDropdown.length > 0 ? "1px solid var(--border-subtle)" : "none" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)" }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}>
                        <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: "13px" }}>+</span>
                        {creatingSpace ? "Creating…" : `Create @${spaceQuery}`}
                      </button>
                    )}
                    {!canCreateSpace && filteredSpaceDropdown.length === 0 && (
                      <div style={{ padding: "10px 14px 12px", fontSize: "13px", color: "var(--text-3)" }}>
                        No spaces yet — type a name to create one
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── E. Entities section (edit mode only) ── */}
            <div style={{ padding: "16px 24px 24px", borderTop: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-3)", fontFamily: "var(--font-geist-mono, monospace)" }}>
                  Entities
                </span>
                <span style={{ fontSize: "11px", color: "var(--text-3)", fontStyle: "italic" }}>· auto-detected</span>
              </div>

              {panelMode === "create" ? (
                <p style={{ fontSize: "13px", color: "var(--text-3)", fontStyle: "italic", margin: 0 }}>
                  Entities will be auto-detected on save
                </p>
              ) : selectedNote && selectedNote.entities.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {selectedNote.entities.map((entity) => {
                    const s = entityStyle(entity.type)
                    return (
                      <span key={entity.id} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 9px", borderRadius: "8px", background: s.bg, border: `1px solid ${s.border}` }}>
                        <span style={{ fontSize: "10px", color: s.text, fontFamily: "var(--font-geist-mono, monospace)", textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.8 }}>
                          {entity.type}
                        </span>
                        <span style={{ fontSize: "12px", fontWeight: 600, color: s.text }}>
                          {entity.name}
                        </span>
                      </span>
                    )
                  })}
                </div>
              ) : (
                <p style={{ fontSize: "13px", color: "var(--text-3)", fontStyle: "italic", margin: 0 }}>
                  {panelSaved ? "Entities will update shortly" : "No entities detected yet"}
                </p>
              )}
            </div>
          </div>

          {/* ── F. Sticky save / status bar ── */}
          <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", flexShrink: 0, background: "var(--bg-surface)" }}>
            {panelMode === "create" ? (
              <button onClick={handleCreateNote} disabled={!panelText.trim() || panelCreating}
                style={{
                  width: "100%", padding: "11px", borderRadius: "10px", fontSize: "14px", fontWeight: 600,
                  background: panelText.trim() ? "var(--accent)" : "var(--bg-hover)",
                  color: panelText.trim() ? "#FFFFFF" : "var(--text-3)",
                  border: "none", cursor: panelText.trim() ? "pointer" : "default",
                  boxShadow: panelText.trim() ? "0 0 20px rgba(212, 119, 92, 0.25)" : "none",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => { if (panelText.trim()) e.currentTarget.style.background = "var(--accent-hover)" }}
                onMouseLeave={(e) => { if (panelText.trim()) e.currentTarget.style.background = "var(--accent)" }}>
                {panelCreating ? "Creating…" : "Create Note"}
              </button>
            ) : (
              <button
                onClick={() => { doSave(panelText, panelSpacesRef.current); setPanelDirty(false) }}
                disabled={!panelDirty || panelSaving}
                style={{
                  width: "100%", padding: "11px", borderRadius: "10px", fontSize: "14px", fontWeight: 600,
                  background: panelDirty ? "var(--accent)" : "var(--bg-hover)",
                  color: panelDirty ? "#FFFFFF" : "var(--text-3)",
                  border: "none", cursor: panelDirty ? "pointer" : "default",
                  boxShadow: panelDirty ? "0 0 20px rgba(212, 119, 92, 0.25)" : "none",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => { if (panelDirty) e.currentTarget.style.background = "var(--accent-hover)" }}
                onMouseLeave={(e) => { if (panelDirty) e.currentTarget.style.background = "var(--accent)" }}
              >
                {panelSaving ? "Saving…" : panelDirty ? "Save Changes" : "Saved"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
