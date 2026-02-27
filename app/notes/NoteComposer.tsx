"use client"

import { useEffect, useRef, useState } from "react"
import type { NoteWithEntities } from "./types"

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface NoteComposerProps {
  initialValue?: string
  initialEntities?: { name: string; type: string }[]
  mode: "create" | "edit"
  noteId?: string
  onSave: (note: NoteWithEntities) => void
  onCancel: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function NoteComposer({
  initialValue = "",
  initialEntities = [],
  mode,
  noteId,
  onSave,
  onCancel,
}: NoteComposerProps) {
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detectedEntities, setDetectedEntities] = useState<{ name: string; type: string }[]>(initialEntities)
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
      onSave(note)
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
      {/* Entity chips preview */}
      <div style={{ minHeight: "24px", display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "center" }}>
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
            {value.trim().length > 20 ? "Detecting entities…" : "Entities will appear as you type"}
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
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
            {mode === "edit" ? "⌘↵ to save" : "⌘↵ to save"}
          </span>
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
