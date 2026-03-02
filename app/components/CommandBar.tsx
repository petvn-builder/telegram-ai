"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { useAiPanel } from "./AiPanelContext"
import type { NoteWithEntities } from "@/app/notes/types"
import type { TaskWithEntities } from "@/app/notes/types"

// ── Types ─────────────────────────────────────────────────────────────────────

type CommandItem = {
  id: string
  type: "note" | "task" | "action" | "ai"
  label: string
  meta?: string
  onSelect: () => void
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function TaskIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

function ActionIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  )
}

// ── CommandBar ────────────────────────────────────────────────────────────────

export default function CommandBar() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [hasFetched, setHasFetched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const { sendCommand } = useAiPanel()

  // Lazy load data — only after first open
  const { data: notesRes } = useSWR(
    hasFetched ? "/api/notes?limit=20" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )
  const notes: NoteWithEntities[] = notesRes?.notes ?? []
  const { data: tasks = [] } = useSWR<TaskWithEntities[]>(
    hasFetched ? "/api/tasks" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  // Global ⌘K listener
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((v) => {
          if (!v) setHasFetched(true)
          return !v
        })
      }
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  // Focus input when open
  useEffect(() => {
    if (open) {
      setQuery("")
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Build items
  const items: CommandItem[] = []
  const q = query.toLowerCase().trim()

  if (q) {
    // Note results
    const matchedNotes = notes
      .filter((n) => n.content.toLowerCase().includes(q))
      .slice(0, 4)
    matchedNotes.forEach((n) => {
      const preview = n.content.replace(/\n/g, " ").slice(0, 60)
      items.push({
        id: `note-${n.id}`,
        type: "note",
        label: preview || "Untitled note",
        meta: new Date(n.created_at).toLocaleDateString("en", { month: "short", day: "numeric" }),
        onSelect: () => { router.push(`/notes?open=${n.id}`); setOpen(false) },
      })
    })

    // Task results
    const matchedTasks = tasks
      .filter((t) => t.title.toLowerCase().includes(q))
      .slice(0, 3)
    matchedTasks.forEach((t) => {
      items.push({
        id: `task-${t.id}`,
        type: "task",
        label: t.title,
        meta: t.status,
        onSelect: () => { router.push("/tasks"); setOpen(false) },
      })
    })

    // Action items
    items.push({
      id: "create-note",
      type: "action",
      label: `Create note: "${query}"`,
      onSelect: () => {
        router.push(`/notes?compose=1&text=${encodeURIComponent(query)}`)
        setOpen(false)
      },
    })
    items.push({
      id: "create-task",
      type: "action",
      label: `Create task: "${query}"`,
      onSelect: () => {
        router.push(`/tasks?create=1&title=${encodeURIComponent(query)}`)
        setOpen(false)
      },
    })
    items.push({
      id: "ask-ai",
      type: "ai",
      label: `Ask AI: "${query}"`,
      onSelect: () => {
        sendCommand(query)
        setOpen(false)
      },
    })
  } else {
    // Default: recent notes
    notes.slice(0, 4).forEach((n) => {
      const preview = n.content.replace(/\n/g, " ").slice(0, 60)
      items.push({
        id: `note-${n.id}`,
        type: "note",
        label: preview || "Untitled note",
        meta: new Date(n.created_at).toLocaleDateString("en", { month: "short", day: "numeric" }),
        onSelect: () => { router.push(`/notes?open=${n.id}`); setOpen(false) },
      })
    })
    // Default actions
    items.push({ id: "new-note", type: "action", label: "New Note", meta: "N", onSelect: () => { router.push("/notes?compose=1"); setOpen(false) } })
    items.push({ id: "new-task", type: "action", label: "New Task", meta: "T", onSelect: () => { router.push("/tasks?create=1"); setOpen(false) } })
    items.push({ id: "open-ai", type: "ai", label: "Open AI Assistant", onSelect: () => { sendCommand(""); setOpen(false) } })
  }

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        items[selectedIndex]?.onSelect()
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [open, selectedIndex, items])

  // Reset selection when items change
  useEffect(() => { setSelectedIndex(0) }, [query])

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="command-bar-backdrop"
        onClick={() => setOpen(false)}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.35)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 200,
        }}
      />

      {/* Palette */}
      <div
        style={{
          position: "fixed",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(560px, calc(100vw - 40px))",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          borderRadius: "14px",
          boxShadow: "var(--shadow-lg)",
          zIndex: 201,
          overflow: "hidden",
        }}
      >
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px", borderBottom: items.length > 0 ? "1px solid var(--border-subtle)" : "none" }}>
          <span style={{ color: "var(--text-3)", display: "flex", alignItems: "center", flexShrink: 0 }}>
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, tasks, or ask AI..."
            style={{
              flex: 1,
              fontSize: "16px",
              color: "var(--text-1)",
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <kbd style={{ fontSize: "11px", color: "var(--text-3)", background: "var(--bg-hover)", padding: "2px 6px", borderRadius: "5px", flexShrink: 0, fontFamily: "inherit" }}>
            esc
          </kbd>
        </div>

        {/* Results */}
        {items.length > 0 && (
          <div style={{ maxHeight: "340px", overflowY: "auto" }}>
            {!q && notes.length > 0 && (
              <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", padding: "10px 20px 4px", margin: 0 }}>
                Recent
              </p>
            )}
            {!q && (
              <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.08em", textTransform: "uppercase", padding: "10px 20px 4px", margin: 0, display: notes.length > 0 ? "none" : "block" }}>
                Actions
              </p>
            )}
            {items.map((item, index) => (
              <button
                key={item.id}
                onClick={item.onSelect}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 20px",
                  cursor: "pointer",
                  background: index === selectedIndex ? "var(--bg-hover)" : "transparent",
                  border: "none",
                  width: "100%",
                  textAlign: "left",
                  transition: "background 0.1s",
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span style={{
                  color: item.type === "ai" ? "var(--ai-accent)" : item.type === "action" ? "var(--accent)" : "var(--text-3)",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0,
                }}>
                  {item.type === "note" && <NoteIcon />}
                  {item.type === "task" && <TaskIcon />}
                  {item.type === "action" && <ActionIcon />}
                  {item.type === "ai" && <SparkleIcon />}
                </span>
                <span style={{ flex: 1, fontSize: "14px", color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.label}
                </span>
                {item.meta && (
                  <span style={{ fontSize: "11px", color: "var(--text-3)", flexShrink: 0 }}>
                    {item.meta}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Footer hint */}
        <div style={{ padding: "8px 20px", borderTop: "1px solid var(--border-subtle)", display: "flex", gap: "16px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>↑↓ navigate</span>
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>↵ select</span>
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>esc close</span>
        </div>
      </div>
    </>
  )
}
