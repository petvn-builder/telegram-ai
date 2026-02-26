"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import type { NoteDetail } from "../types"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  person:   { bg: "rgba(59,130,246,0.14)",  text: "#60a5fa", border: "rgba(59,130,246,0.28)"  },
  project:  { bg: "rgba(139,92,246,0.14)",  text: "#a78bfa", border: "rgba(139,92,246,0.28)"  },
  company:  { bg: "rgba(245,158,11,0.14)",  text: "#fbbf24", border: "rgba(245,158,11,0.28)"  },
  tool:     { bg: "rgba(16,185,129,0.14)",  text: "#34d399", border: "rgba(16,185,129,0.28)"  },
  topic:    { bg: "rgba(99,102,241,0.14)",  text: "#818cf8", border: "rgba(99,102,241,0.28)"  },
  goal:     { bg: "rgba(236,72,153,0.14)",  text: "#f472b6", border: "rgba(236,72,153,0.28)"  },
  event:    { bg: "rgba(249,115,22,0.14)",  text: "#fb923c", border: "rgba(249,115,22,0.28)"  },
  resource: { bg: "rgba(20,184,166,0.14)",  text: "#2dd4bf", border: "rgba(20,184,166,0.28)"  },
}

function entityColor(type: string) {
  return ENTITY_COLORS[type] ?? { bg: "rgba(255,255,255,0.09)", text: "var(--text-2)", border: "rgba(255,255,255,0.16)" }
}

function SkeletonLine({ width }: { width: string }) {
  return (
    <div
      className="skeleton"
      style={{ height: "13px", borderRadius: "6px", width, marginBottom: "10px" }}
    />
  )
}

export default function NoteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [note, setNote] = useState<NoteDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/notes/${id}`)
      .then((res) => {
        if (res.status === 404) throw new Error("Note not found")
        if (!res.ok) throw new Error("Failed to load note")
        return res.json()
      })
      .then((data: NoteDetail) => setNote(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div
      className="page-fade-in"
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        padding: "40px 40px",
      }}
    >
      <div style={{ maxWidth: "680px" }}>

        {/* Back */}
        <Link
          href="/notes"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            color: "var(--text-2)",
            textDecoration: "none",
            marginBottom: "28px",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-1)" }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-2)" }}
        >
          ← Notes
        </Link>

        {/* Loading */}
        {loading && (
          <div style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            padding: "28px",
          }}>
            <SkeletonLine width="30%" />
            <div style={{ marginTop: "16px" }}>
              <SkeletonLine width="100%" />
              <SkeletonLine width="88%" />
              <SkeletonLine width="94%" />
              <SkeletonLine width="70%" />
            </div>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.20)",
            borderRadius: "16px",
            padding: "48px 28px",
            textAlign: "center",
          }}>
            <p style={{ fontSize: "14px", color: "#f87171", margin: "0 0 16px" }}>{error}</p>
            <Link
              href="/notes"
              style={{ fontSize: "13px", color: "var(--text-2)", textDecoration: "none" }}
            >
              ← Back to Notes
            </Link>
          </div>
        )}

        {/* Content */}
        {!loading && note && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Main card */}
            <div style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "28px",
            }}>
              <p style={{
                fontSize: "11px",
                color: "var(--text-2)",
                margin: "0 0 20px",
                letterSpacing: "0.02em",
              }}>
                {formatDate(note.created_at)}
              </p>
              <p style={{
                fontSize: "14px",
                lineHeight: 1.8,
                color: "var(--text-1)",
                whiteSpace: "pre-wrap",
                margin: 0,
              }}>
                {note.content}
              </p>
            </div>

            {/* Entities */}
            {note.relatedEntities.length > 0 && (
              <div style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                borderRadius: "16px",
                padding: "20px 28px",
              }}>
                <p style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "var(--text-2)",
                  margin: "0 0 12px",
                }}>
                  Linked Entities
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {note.relatedEntities.map((entity) => {
                    const c = entityColor(entity.type)
                    return (
                      <Link
                        key={entity.id}
                        href="/graph"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          padding: "5px 12px",
                          borderRadius: "999px",
                          fontSize: "12px",
                          fontWeight: 500,
                          background: c.bg,
                          color: c.text,
                          border: `1px solid ${c.border}`,
                          textDecoration: "none",
                          transition: "filter 0.15s",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = "brightness(1.15)" }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = "none" }}
                      >
                        {entity.name}
                        <span style={{ opacity: 0.55, fontSize: "10px" }}>{entity.type}</span>
                      </Link>
                    )
                  })}
                </div>

                <Link
                  href="/graph"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    marginTop: "14px",
                    fontSize: "12px",
                    color: "#6366f1",
                    textDecoration: "none",
                    gap: "4px",
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.7" }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1" }}
                >
                  View in Knowledge Graph →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
