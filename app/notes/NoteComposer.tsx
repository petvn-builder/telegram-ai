"use client"

import { useEffect, useRef, useState } from "react"
import type { NoteWithEntities, Space, Tag } from "./types"

const SPACE_STYLE = {
  bg: "var(--accent-dim)",
  text: "var(--accent)",
  border: "var(--border-accent)",
}

const TAG_STYLE = {
  bg: "var(--bg-hover)",
  text: "var(--text-2)",
  border: "var(--border)",
}

function Spinner() {
  return (
    <svg
      width="13"
      height="13"
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

type SpaceDropdownOption =
  | { type: "space"; space: Space }
  | { type: "create"; name: string }

type TagDropdownOption =
  | { type: "tag"; tag: Tag }
  | { type: "create"; name: string }

interface NoteComposerProps {
  initialValue?: string
  initialEntities?: { name: string; type: string }[] // kept for API compatibility
  initialSpaces?: Space[]
  mode: "create" | "edit"
  noteId?: string
  onSave: (note: NoteWithEntities) => void
  onCancel: () => void
}

// Get the partial #word immediately before the cursor, or null
function getTagWordAtCursor(text: string, cursorPos: number): string | null {
  const before = text.slice(0, cursorPos)
  const match = before.match(/#([a-zA-Z0-9_-]*)$/)
  return match ? match[1] : null
}

// Replace the partial #word before cursor with the chosen tag
function replaceTagWord(
  text: string,
  cursorPos: number,
  tagName: string
): { newText: string; newCursor: number } {
  const before = text.slice(0, cursorPos)
  const after = text.slice(cursorPos)
  const newBefore = before.replace(/#([a-zA-Z0-9_-]*)$/, `#${tagName} `)
  return { newText: newBefore + after, newCursor: newBefore.length }
}

export default function NoteComposer({
  initialValue = "",
  initialEntities: _initialEntities = [],
  initialSpaces = [],
  mode,
  noteId,
  onSave,
  onCancel,
}: NoteComposerProps) {
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [error, setError] = useState<string | null>(null)

  // Space state
  const [availableSpaces, setAvailableSpaces] = useState<Space[]>([])
  const [assignedSpaces, setAssignedSpaces] = useState<string[]>(() =>
    initialSpaces.map((s) => s.name)
  )
  const [spaceInput, setSpaceInput] = useState("")
  const [spaceDropdownVisible, setSpaceDropdownVisible] = useState(false)
  const [spaceDropdownIndex, setSpaceDropdownIndex] = useState(0)

  // Tag state
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [tagWord, setTagWord] = useState<string | null>(null) // partial word after #
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const spaceInputRef = useRef<HTMLInputElement>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedNoteIdRef = useRef<string | null>(noteId ?? null)

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

  // Load available spaces and tags
  useEffect(() => {
    fetch("/api/spaces")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Space[]) => setAvailableSpaces(data))
      .catch(() => {})
    fetch("/api/tags")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Tag[]) => setAvailableTags(data))
      .catch(() => {})
  }, [])

  // Reset dropdown indices when inputs change
  useEffect(() => { setSpaceDropdownIndex(0) }, [spaceInput])
  useEffect(() => { setTagDropdownIndex(0) }, [tagWord])

  // ── Tag helpers ───────────────────────────────────────────────────────────

  const tagDropdownOptions: TagDropdownOption[] = (() => {
    if (tagWord === null) return []
    const q = tagWord.toLowerCase()
    const filtered = availableTags.filter((t) => t.name.includes(q))
    const options: TagDropdownOption[] = filtered.map((t) => ({ type: "tag", tag: t }))
    const exactMatch = availableTags.some((t) => t.name === q)
    if (q.length > 0 && !exactMatch) options.push({ type: "create", name: q })
    return options
  })()

  function selectTagOption(opt: TagDropdownOption) {
    const tagName = opt.type === "tag" ? opt.tag.name : opt.name
    const ta = textareaRef.current
    if (!ta) return
    const cursorPos = ta.selectionStart ?? value.length
    const { newText, newCursor } = replaceTagWord(value, cursorPos, tagName)
    setValue(newText)
    setTagWord(null)

    // Add to available tags if new
    if (opt.type === "create" && !availableTags.some((t) => t.name === tagName)) {
      setAvailableTags((prev) => [...prev, { id: `temp-${tagName}`, name: tagName }])
    }

    // Restore cursor after re-render
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(newCursor, newCursor)
    })
  }

  // ── Space helpers ─────────────────────────────────────────────────────────

  function getSpaceQuery(input: string): string {
    return (input.startsWith("@") ? input.slice(1) : input).toLowerCase().trim()
  }

  const spaceDropdownOptions: SpaceDropdownOption[] = (() => {
    if (!spaceDropdownVisible || !spaceInput.trim()) return []
    const q = getSpaceQuery(spaceInput)
    const filtered = availableSpaces.filter(
      (s) => s.name.includes(q) && !assignedSpaces.includes(s.name)
    )
    const options: SpaceDropdownOption[] = filtered.map((s) => ({ type: "space", space: s }))
    const exactMatch = availableSpaces.some((s) => s.name === q) || assignedSpaces.includes(q)
    if (q.length > 0 && !exactMatch) options.push({ type: "create", name: q })
    return options
  })()

  function selectSpaceOption(opt: SpaceDropdownOption) {
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

  // ── Save logic ────────────────────────────────────────────────────────────

  async function doSave(isAutoSave = false) {
    if (!value.trim()) return
    if (isAutoSave) {
      setSaveStatus("saving")
    } else {
      setSaving(true)
    }
    setError(null)

    try {
      const currentNoteId = savedNoteIdRef.current
      const url = currentNoteId ? `/api/notes/${currentNoteId}` : "/api/notes"
      const method = currentNoteId ? "PUT" : "POST"

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
      const fullNote: NoteWithEntities = {
        ...note,
        spaces: note.spaces ?? [],
        entities: note.entities ?? [],
        tags: note.tags ?? [],
      }

      if (!savedNoteIdRef.current) {
        savedNoteIdRef.current = note.id
      }

      if (isAutoSave) {
        setSaveStatus("saved")
        onSave(fullNote)
        setTimeout(() => setSaveStatus("idle"), 2500)
      } else {
        onSave(fullNote)
      }
    } catch (err: any) {
      setError(err.message ?? "Something went wrong")
      if (isAutoSave) {
        setSaveStatus("idle")
      } else {
        setSaving(false)
      }
    }

    if (!isAutoSave) {
      setSaving(false)
    }
  }

  function onTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value
    setValue(newValue)

    // Detect #tag typing
    const cursor = e.target.selectionStart ?? newValue.length
    const word = getTagWordAtCursor(newValue, cursor)
    setTagWord(word)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Tag dropdown navigation
    if (tagWord !== null && tagDropdownOptions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setTagDropdownIndex((i) => Math.min(i + 1, tagDropdownOptions.length - 1))
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setTagDropdownIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        const opt = tagDropdownOptions[tagDropdownIndex]
        if (opt) {
          e.preventDefault()
          selectTagOption(opt)
          return
        }
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setTagWord(null)
        return
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
      doSave(false)
    }
    if (e.key === "Escape" && tagWord === null) {
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
  const tagDropdownVisible = tagWord !== null && tagDropdownOptions.length > 0

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {/* Textarea with tag dropdown */}
      <div style={{ position: "relative" }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={onTextareaChange}
          onKeyDown={onKeyDown}
          onSelect={() => {
            // Update tag word on cursor move
            const ta = textareaRef.current
            if (!ta) return
            const word = getTagWordAtCursor(ta.value, ta.selectionStart ?? 0)
            setTagWord(word)
          }}
          placeholder="Write a note… use #tag to label"
          rows={4}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            borderRadius: "0",
            padding: "0",
            fontSize: "16px",
            lineHeight: 1.75,
            color: "var(--text-1)",
            resize: "none",
            outline: "none",
            fontFamily: "inherit",
            overflowY: "hidden",
            boxSizing: "border-box",
            minHeight: "140px",
          }}
        />

        {/* Tag autocomplete dropdown */}
        {tagDropdownVisible && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              minWidth: "200px",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              zIndex: 100,
              overflow: "hidden",
            }}
          >
            {tagDropdownOptions.map((opt, i) => {
              const isActive = i === tagDropdownIndex
              if (opt.type === "tag") {
                return (
                  <button
                    key={opt.tag.id}
                    onMouseDown={(e) => { e.preventDefault(); selectTagOption(opt) }}
                    onMouseEnter={() => setTagDropdownIndex(i)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "8px 12px",
                      fontSize: "13px",
                      color: isActive ? "var(--text-1)" : "var(--text-2)",
                      background: isActive ? "var(--bg-hover)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                  >
                    <span style={{ color: "var(--text-3)", fontSize: "12px" }}>#</span>
                    <span>{opt.tag.name}</span>
                  </button>
                )
              }
              return (
                <button
                  key={`create-${opt.name}`}
                  onMouseDown={(e) => { e.preventDefault(); selectTagOption(opt) }}
                  onMouseEnter={() => setTagDropdownIndex(i)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 12px",
                    fontSize: "13px",
                    color: isActive ? "var(--text-1)" : "var(--text-2)",
                    background: isActive ? "var(--bg-hover)" : "transparent",
                    border: "none",
                    borderTop: tagDropdownOptions.length > 1 ? "1px solid var(--border-subtle)" : "none",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Create </span>
                  <span style={{ fontWeight: 500 }}>#{opt.name}</span>
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

      {/* Space section */}
      <div
        style={{
          borderTop: "1px solid var(--border-subtle)",
          paddingTop: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontWeight: 400,
            color: "var(--text-3)",
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
              minHeight: "26px",
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
                  gap: "4px",
                  padding: "2px 8px",
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
                @{name}
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ opacity: 0.5 }}>
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
              placeholder={assignedSpaces.length === 0 ? "Add a space…" : "@spaceName…"}
              style={{
                flex: 1,
                minWidth: "120px",
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
          paddingTop: "16px",
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
            color: "var(--text-3)",
            background: "transparent",
            border: "none",
            cursor: saving ? "not-allowed" : "pointer",
            padding: "5px 0",
            opacity: saving ? 0.5 : 1,
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { if (!saving) e.currentTarget.style.color = "var(--text-2)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
        >
          Cancel
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {saveStatus === "saved" && (
            <span style={{ fontSize: "12px", color: "var(--text-3)" }}>· Saved</span>
          )}
          <button
            onClick={() => {
              if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
              doSave(false)
            }}
            disabled={saving || isEmpty}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 14px",
              borderRadius: "7px",
              fontSize: "13px",
              fontWeight: 500,
              background: "transparent",
              color: saving || isEmpty ? "var(--text-3)" : "var(--text-2)",
              border: `1px solid ${saving || isEmpty ? "var(--border)" : "var(--border-hover)"}`,
              cursor: saving || isEmpty ? "not-allowed" : "pointer",
              transition: "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!saving && !isEmpty) {
                e.currentTarget.style.color = "var(--text-1)"
              }
            }}
            onMouseLeave={(e) => {
              if (!saving && !isEmpty) {
                e.currentTarget.style.color = "var(--text-2)"
              }
            }}
          >
            {saving && <Spinner />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
