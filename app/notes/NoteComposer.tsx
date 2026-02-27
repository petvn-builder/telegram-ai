"use client"

import { useEffect, useRef, useState } from "react"
import type { NoteWithEntities, Space } from "./types"

// ── Entity styling (mirrors page.tsx) ────────────────────────────────────────

const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person:   { bg: "rgba(59,130,246,0.14)",  text: "#60a5fa", border: "rgba(59,130,246,0.28)" },
  project:  { bg: "rgba(139,92,246,0.14)",  text: "#a78bfa", border: "rgba(139,92,246,0.28)" },
  company:  { bg: "rgba(245,158,11,0.14)",  text: "#fbbf24", border: "rgba(245,158,11,0.28)" },
  tool:     { bg: "rgba(16,185,129,0.14)",  text: "#34d399", border: "rgba(16,185,129,0.28)" },
  topic:    { bg: "rgba(99,102,241,0.14)",  text: "#818cf8", border: "rgba(99,102,241,0.28)" },
  goal:     { bg: "rgba(236,72,153,0.14)",  text: "#f472b6", border: "rgba(236,72,153,0.28)" },
  event:    { bg: "rgba(249,115,22,0.14)",  text: "#fb923c", border: "rgba(249,115,22,0.28)" },
  resource: { bg: "rgba(20,184,166,0.14)",  text: "#2dd4bf", border: "rgba(20,184,166,0.28)" },
}

const SPACE_STYLE = { bg: "rgba(99,102,241,0.12)", text: "#818cf8", border: "rgba(99,102,241,0.30)" }

function entityStyle(type: string) {
  return ENTITY_COLORS[type] ?? {
    bg: "rgba(255,255,255,0.09)",
    text: "var(--text-2)",
    border: "rgba(255,255,255,0.16)",
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSpacesFromText(text: string): string[] {
  const matches = [...text.matchAll(/(^|\s)@([a-zA-Z0-9_-]+)/g)]
  return [...new Set(matches.map((m) => m[2].toLowerCase()))]
}

function detectActiveSpaceQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor)
  const match = before.match(/(^|\s)@([a-zA-Z0-9_-]*)$/)
  return match ? match[2] : null
}

// ── Spinner icon ──────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ animation: "spin 0.7s linear infinite" }}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface NoteComposerProps {
  initialValue?: string
  initialEntities?: { name: string; type: string }[]
  initialSpaces?: Space[]
  mode: "create" | "edit"
  noteId?: string
  onSave: (note: NoteWithEntities) => void
  onCancel: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NoteComposer({
  initialValue = "",
  initialEntities = [],
  initialSpaces = [],
  mode,
  noteId,
  onSave,
  onCancel,
}: NoteComposerProps) {
  const [value, setValue] = useState(() => {
    // In edit mode, reconstruct text with @space tokens for editing
    if (mode === "edit" && initialSpaces.length > 0) {
      const tokens = initialSpaces.map((s) => `@${s.name}`).join(" ")
      return initialValue ? `${initialValue}\n${tokens}` : tokens
    }
    return initialValue
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detectedEntities, setDetectedEntities] = useState<{ name: string; type: string }[]>(initialEntities)
  const [availableSpaces, setAvailableSpaces] = useState<Space[]>([])
  const [spaceQuery, setSpaceQuery] = useState<string | null>(null)
  const [dropdownIndex, setDropdownIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = ta.scrollHeight + "px"
  }, [value])

  // Load available spaces for autocomplete
  useEffect(() => {
    fetch("/api/spaces")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Space[]) => setAvailableSpaces(data))
      .catch(() => {})
  }, [])

  // Debounced entity extraction preview
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 20) return

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/notes/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: value }),
        })
        if (!res.ok) return
        const data = await res.json()
        if (Array.isArray(data.entities)) setDetectedEntities(data.entities)
      } catch {}
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [value])

  // Reset dropdown index when query changes
  useEffect(() => {
    setDropdownIndex(0)
  }, [spaceQuery])

  // Spaces detected in current text
  const detectedSpaces = getSpacesFromText(value)

  // Autocomplete dropdown options
  const dropdownOptions: Array<{ type: "space"; space: Space } | { type: "create"; name: string }> = (() => {
    if (spaceQuery === null) return []
    const q = spaceQuery.toLowerCase()
    const filtered = availableSpaces.filter((s) => s.name.includes(q) && !detectedSpaces.includes(s.name))
    const options: Array<{ type: "space"; space: Space } | { type: "create"; name: string }> = filtered.map((s) => ({ type: "space" as const, space: s }))
    const exactMatch = availableSpaces.some((s) => s.name === q) || detectedSpaces.includes(q)
    if (q.length > 0 && !exactMatch) {
      options.push({ type: "create" as const, name: q })
    }
    return options
  })()

  function selectDropdownOption(option: typeof dropdownOptions[number]) {
    const ta = textareaRef.current
    if (!ta) return
    const cursor = ta.selectionStart
    const before = value.slice(0, cursor)
    const after = value.slice(cursor)
    // Replace the trailing @partial with @completedName
    const newBefore = before.replace(/(^|\s)@([a-zA-Z0-9_-]*)$/, (_, prefix) => `${prefix}@${option.type === "space" ? option.space.name : option.name}`)
    const newValue = newBefore + after
    setValue(newValue)
    setSpaceQuery(null)
    // Restore cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(newBefore.length, newBefore.length)
    })
    // Add newly created space to available list optimistically
    if (option.type === "create") {
      setAvailableSpaces((prev) => [
        ...prev,
        { id: `temp-${option.name}`, name: option.name, note_count: 0 },
      ])
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value
    setValue(newValue)
    const cursor = e.target.selectionStart
    const query = detectActiveSpaceQuery(newValue, cursor)
    setSpaceQuery(query)
  }

  async function handleSave() {
    if (saving || !value.trim()) return
    setSaving(true)
    setError(null)

    try {
      const url = mode === "edit" && noteId ? `/api/notes/${noteId}` : "/api/notes"
      const method = mode === "edit" ? "PUT" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: value.trim() }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Save failed")
      }

      const note = await res.json()
      onSave({ ...note, spaces: note.spaces ?? [], entities: note.entities ?? [] })
    } catch (err: any) {
      setError(err.message ?? "Something went wrong")
      setSaving(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Dropdown navigation
    if (spaceQuery !== null && dropdownOptions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setDropdownIndex((i) => Math.min(i + 1, dropdownOptions.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setDropdownIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        const opt = dropdownOptions[dropdownIndex]
        if (opt) selectDropdownOption(opt)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setSpaceQuery(null)
        return
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSave()
    }
    if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  const isEmpty = !value.trim()
  const showDropdown = spaceQuery !== null && dropdownOptions.length > 0

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-accent)",
        borderLeft: "2px solid var(--accent)",
        borderRadius: "12px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Top row: space pills + entity chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center", minHeight: "24px" }}>
        {/* Space pills (derived from text) */}
        {detectedSpaces.map((name) => (
          <span
            key={name}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 9px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 500,
              background: SPACE_STYLE.bg,
              color: SPACE_STYLE.text,
              border: `1px solid ${SPACE_STYLE.border}`,
              whiteSpace: "nowrap",
            }}
          >
            @{name}
          </span>
        ))}

        {/* Divider between spaces and entities */}
        {detectedSpaces.length > 0 && detectedEntities.length > 0 && (
          <div style={{ width: "1px", height: "16px", background: "var(--border)", margin: "0 3px", flexShrink: 0 }} />
        )}

        {/* Entity chips */}
        {detectedEntities.length > 0 ? (
          detectedEntities.map((e, i) => {
            const s = entityStyle(e.type)
            return (
              <span
                key={i}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "3px 9px",
                  borderRadius: "999px",
                  fontSize: "11px",
                  fontWeight: 500,
                  background: s.bg,
                  color: s.text,
                  border: `1px solid ${s.border}`,
                  whiteSpace: "nowrap",
                }}
              >
                {e.name}
                <span style={{ opacity: 0.6, fontSize: "10px" }}>{e.type}</span>
              </span>
            )
          })
        ) : detectedSpaces.length === 0 ? (
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
            {value.trim().length > 20 ? "Detecting entities…" : "Type @space to assign · entities appear as you write"}
          </span>
        ) : null}
      </div>

      {/* Textarea */}
      <div style={{ position: "relative" }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder="Write a note… use @space to organize"
          rows={4}
          style={{
            width: "100%",
            background: "var(--bg-base)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            padding: "12px",
            fontSize: "14px",
            lineHeight: 1.65,
            color: "var(--text-1)",
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            overflowY: "hidden",
            boxSizing: "border-box",
            transition: "border-color 0.15s",
            minHeight: "96px",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--border-accent)" }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border)"
            // Delay hiding dropdown so clicks register
            setTimeout(() => setSpaceQuery(null), 150)
          }}
        />

        {/* Autocomplete dropdown */}
        {showDropdown && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "var(--shadow-lg)",
              zIndex: 100,
              overflow: "hidden",
            }}
          >
            {dropdownOptions.map((opt, i) => {
              const isActive = i === dropdownIndex
              if (opt.type === "space") {
                return (
                  <button
                    key={opt.space.id}
                    onMouseDown={(e) => { e.preventDefault(); selectDropdownOption(opt) }}
                    onMouseEnter={() => setDropdownIndex(i)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "9px 12px",
                      fontSize: "13px",
                      color: isActive ? "var(--text-1)" : "var(--text-2)",
                      background: isActive ? "var(--bg-hover)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                  >
                    <span style={{ color: SPACE_STYLE.text, fontSize: "12px", fontWeight: 500 }}>@{opt.space.name}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-3)", marginLeft: "auto" }}>
                      {opt.space.note_count} {opt.space.note_count === 1 ? "note" : "notes"}
                    </span>
                  </button>
                )
              }
              return (
                <button
                  key={`create-${opt.name}`}
                  onMouseDown={(e) => { e.preventDefault(); selectDropdownOption(opt) }}
                  onMouseEnter={() => setDropdownIndex(i)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "9px 12px",
                    fontSize: "13px",
                    color: isActive ? "var(--text-1)" : "var(--text-2)",
                    background: isActive ? "var(--bg-hover)" : "transparent",
                    border: "none",
                    borderTop: dropdownOptions.length > 1 ? "1px solid var(--border-subtle)" : "none",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Create </span>
                  <span style={{ color: SPACE_STYLE.text, fontWeight: 500 }}>@{opt.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Inline error */}
      {error && (
        <p style={{ fontSize: "12px", color: "#f87171", margin: 0 }}>
          {error}
        </p>
      )}

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <button
          onClick={onCancel}
          disabled={saving}
          style={{
            fontSize: "13px",
            color: "var(--text-2)",
            background: "transparent",
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            padding: "6px 0",
            opacity: saving ? 0.5 : 1,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { if (!saving) e.currentTarget.style.color = "var(--text-1)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-2)" }}
        >
          Cancel
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>⌘↵ to save</span>
          <button
            onClick={handleSave}
            disabled={saving || isEmpty}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 16px",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: 500,
              background: saving || isEmpty ? "var(--accent-dim)" : "var(--accent)",
              color: saving || isEmpty ? "var(--text-3)" : "#fff",
              border: "none",
              cursor: saving || isEmpty ? "not-allowed" : "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
          >
            {saving && <Spinner />}
            {mode === "edit" ? "Save Changes" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}
