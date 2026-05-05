"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { EntityIndexEntry } from "@/app/api/graph/route"

type Props = {
  index: EntityIndexEntry[]
  onPick: (entity: EntityIndexEntry) => void
}

export function GraphSearchBar({ index, onPick }: Props) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as EntityIndexEntry[]
    const scored: { entry: EntityIndexEntry; score: number }[] = []
    for (const e of index) {
      const name = e.name.toLowerCase()
      if (name === q) scored.push({ entry: e, score: 100 })
      else if (name.startsWith(q)) scored.push({ entry: e, score: 80 })
      else if (name.includes(q)) scored.push({ entry: e, score: 50 })
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 8).map((s) => s.entry)
  }, [query, index])

  useEffect(() => {
    setHighlight(0)
  }, [query])

  // Keyboard: ⌘K / Ctrl-K to focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener("mousedown", onClick)
    return () => window.removeEventListener("mousedown", onClick)
  }, [])

  function pick(entry: EntityIndexEntry) {
    onPick(entry)
    setQuery("")
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: 280 }}>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setHighlight((h) => Math.min(matches.length - 1, h + 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setHighlight((h) => Math.max(0, h - 1))
          } else if (e.key === "Enter" && matches[highlight]) {
            e.preventDefault()
            pick(matches[highlight])
          } else if (e.key === "Escape") {
            setOpen(false)
            inputRef.current?.blur()
          }
        }}
        placeholder="Search entities… (⌘K)"
        style={{
          width: "100%",
          padding: "7px 10px",
          fontSize: 13,
          background: "var(--bg-base)",
          color: "var(--text-1)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          outline: "none",
        }}
      />
      {open && matches.length > 0 && (
        <ul
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            margin: 0,
            padding: 4,
            listStyle: "none",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
            zIndex: 50,
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {matches.map((m, i) => (
            <li key={m.id}>
              <button
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(m)}
                style={{
                  display: "flex",
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 10px",
                  fontSize: 13,
                  background: i === highlight ? "var(--accent-dim)" : "transparent",
                  color: "var(--text-1)",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>
                  {m.clusterId ? "in cluster" : "loose"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
