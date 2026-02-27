"use client"

import { useEffect, useRef, useState } from "react"
import type { NoteWithEntities, Space } from "./types"

// ── Entity styling ────────────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

type DropdownOption =
  | { type: "space"; space: Space }
  | { type: "create"; name: string }

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
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detectedEntities, setDetectedEntities] = useState<{ name: string; type: string }[]>(initialEntities)
  const [availableSpaces, setAvailableSpaces] = useState<Space[]>([])
  const [assignedSpaces, setAssignedSpaces] = useState<string[]>(() =>
    initialSpaces.map((s) => s.name)
  )
  const [spaceInput, setSpaceInput] = useState("")
  const [spaceDropdownVisible, setSpaceDropdownVisible] = useState(false)
  const [spaceDropdownIndex, setSpaceDropdownIndex] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const spaceInputRef = useRef<HTMLInputElement>(null)
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

  // Reset dropdown index when space input changes
  useEffect(() => {
    setSpaceDropdownIndex(0)
  }, [spaceInput])

  // ── Space helpers ────────────────────────────────────────────────────────────

  function getSpaceQuery(input: string): string {
    return (input.startsWith("@") ? input.slice(1) : input).toLowerCase().trim()
  }

  const spaceDropdownOptions: DropdownOption[] = (() => {
    if (!spaceDropdownVisible || !spaceInput.trim()) return []
    const q = getSpaceQuery(spaceInput)
    const filtered = availableSpaces.filter(
      (s) => s.name.includes(q) && !assignedSpaces.includes(s.name)
    )
    const options: DropdownOption[] = filtered.map((s) => ({ type: "space", space: s }))
    const exactMatch = availableSpaces.some((s) => s.name === q) || assignedSpaces.includes(q)
    if (q.length > 0 && !exactMatch) options.push({ type: "create", name: q })
    return options
  })()

  function selectSpaceOption(opt: DropdownOption) {
    const name = opt.type === "space" ? opt.space.name : opt.name
    if (!assignedSpaces.includes(name)) {
      setAssignedSpaces((prev) => [...prev, name])
    }
    if (opt.type === "create") {
      setAvailableSpaces((prev) => [
        ...prev,
        { id: `temp-${name}`, name, note_count: 0 },
      ])
    }
    setSpaceInput("")
    setSpaceDropdownVisible(false)
    spaceInputRef.current?.focus()
  }

  function removeAssignedSpace(name: string) {
    setAssignedSpaces((prev) => prev.filter((s) => s !== name))
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

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
        body: JSON.stringify({ content: value.trim(), spaces: assignedSpaces }),
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
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      handleSave()
    }
    if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }

  function onSpaceInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (spaceDropdownOptions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSpaceDropdownIndex((i) => Math.min(i + 1, spaceDropdownOptions.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setSpaceDropdownIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        const opt = spaceDropdownOptions[spaceDropdownIndex]
        if (opt) { selectSpaceOption(opt); return }
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setSpaceInput("")
        setSpaceDropdownVisible(false)
        return
      }
    }
    // Enter with no dropdown — add free-form space name
    if (e.key === "Enter" && spaceInput.trim()) {
      e.preventDefault()
      const name = getSpaceQuery(spaceInput)
      if (name && !assignedSpaces.includes(name)) {
        selectSpaceOption({ type: "create", name })
      }
      return
    }
    if (e.key === "Escape") {
      setSpaceInput("")
      setSpaceDropdownVisible(false)
    }
  }

  const isEmpty = !value.trim()

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
      {/* Entity chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center", minHeight: "24px" }}>
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
        ) : (
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
            {value.trim().length > 20 ? "Detecting entities…" : "Entities will appear as you write"}
          </span>
        )}
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Write a note…"
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
        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
      />

      {/* Inline error */}
      {error && (
        <p style={{ fontSize: "12px", color: "#f87171", margin: 0 }}>
          {error}
        </p>
      )}

      {/* Space section */}
      <div
        style={{
          borderTop: "1px solid var(--border-subtle)",
          paddingTop: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            color: "var(--text-3)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
          }}
        >
          Spaces
        </span>
        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "6px",
              minHeight: "28px",
            }}
          >
            {assignedSpaces.map((name) => (
              <button
                key={name}
                onClick={() => removeAssignedSpace(name)}
                title="Remove space"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  padding: "3px 9px",
                  borderRadius: "999px",
                  fontSize: "12px",
                  fontWeight: 500,
                  background: SPACE_STYLE.bg,
                  color: SPACE_STYLE.text,
                  border: `1px solid ${SPACE_STYLE.border}`,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  transition: "filter 0.12s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.filter = "brightness(1.2)" }}
                onMouseLeave={(e) => { e.currentTarget.style.filter = "none" }}
              >
                {name}
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ opacity: 0.6 }}>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ))}
            <input
              ref={spaceInputRef}
              value={spaceInput}
              onChange={(e) => {
                setSpaceInput(e.target.value)
                setSpaceDropdownVisible(true)
                setSpaceDropdownIndex(0)
              }}
              onKeyDown={onSpaceInputKeyDown}
              onFocus={() => { if (spaceInput.trim()) setSpaceDropdownVisible(true) }}
              onBlur={() => setTimeout(() => setSpaceDropdownVisible(false), 150)}
              placeholder={assignedSpaces.length === 0 ? "Type @spaceName to add a space" : "@spaceName…"}
              style={{
                flex: 1,
                minWidth: "160px",
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: "12px",
                color: "var(--text-2)",
                padding: "3px 0",
                fontFamily: "inherit",
              }}
            />
          </div>

          {/* Space autocomplete dropdown */}
          {spaceDropdownVisible && spaceDropdownOptions.length > 0 && (
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
              {spaceDropdownOptions.map((opt, i) => {
                const isActive = i === spaceDropdownIndex
                if (opt.type === "space") {
                  return (
                    <button
                      key={opt.space.id}
                      onMouseDown={(e) => { e.preventDefault(); selectSpaceOption(opt) }}
                      onMouseEnter={() => setSpaceDropdownIndex(i)}
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
                      <span style={{ color: SPACE_STYLE.text, fontSize: "12px", fontWeight: 500 }}>
                        @{opt.space.name}
                      </span>
                      <span style={{ fontSize: "11px", color: "var(--text-3)", marginLeft: "auto" }}>
                        {opt.space.note_count} {opt.space.note_count === 1 ? "note" : "notes"}
                      </span>
                    </button>
                  )
                }
                return (
                  <button
                    key={`create-${opt.name}`}
                    onMouseDown={(e) => { e.preventDefault(); selectSpaceOption(opt) }}
                    onMouseEnter={() => setSpaceDropdownIndex(i)}
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
                      borderTop: spaceDropdownOptions.length > 1 ? "1px solid var(--border-subtle)" : "none",
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
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: "1px solid var(--border-subtle)",
          paddingTop: "12px",
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
