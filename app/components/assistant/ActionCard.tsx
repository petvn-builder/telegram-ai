"use client"

import { useState } from "react"
import type { ContextItem } from "@/lib/assistant/context"
import type { BriefAction } from "@/lib/assistant/brief"

type Props = {
  item: ContextItem
  action?: BriefAction
}

function typeLabel(t: ContextItem["type"]): string {
  return t === "email" ? "Email" : t === "event" ? "Event" : t === "task" ? "Task" : "Note"
}

function typeColor(t: ContextItem["type"]): string {
  if (t === "email") return "var(--accent)"
  if (t === "event") return "var(--ai-accent)"
  return "var(--text-3)"
}

export default function ActionCard({ item, action }: Props) {
  const [busy, setBusy] = useState<null | "task" | "reply" | "schedule">(null)
  const [done, setDone] = useState<string | null>(null)

  async function createTask() {
    setBusy("task")
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: action?.suggestion ?? item.title,
          status: "next",
        }),
      })
      if (res.ok) setDone("Task created")
      else setDone("Failed")
    } finally {
      setBusy(null)
    }
  }

  function reply() {
    if (item.type !== "email") return
    const to = item.metadata?.people?.[0] ?? ""
    const subject = item.title.startsWith("Re:") ? item.title : `Re: ${item.title}`
    const body = action?.suggestion ? `\n\n— Suggested by BrainOS: ${action.suggestion}` : ""
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  function schedule() {
    window.location.href = "/tasks?create=1"
  }

  const showReply = item.type === "email"
  const showSchedule = action?.type === "schedule" || item.type === "event"

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span
          style={{
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: typeColor(item.type),
          }}
        >
          {typeLabel(item.type)}
        </span>
        {item.metadata?.unread && (
          <span
            style={{
              fontSize: "10px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: "var(--accent-dim)",
              color: "var(--accent)",
            }}
          >
            unread
          </span>
        )}
        {item.metadata?.dueDate && (
          <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
            due {item.metadata.dueDate}
          </span>
        )}
      </div>

      <div
        style={{
          fontSize: "14px",
          fontWeight: 500,
          color: "var(--text-1)",
          lineHeight: 1.4,
        }}
      >
        {item.title}
      </div>

      {action?.suggestion && (
        <div
          style={{
            fontSize: "13px",
            color: "var(--text-2)",
            lineHeight: 1.5,
            padding: "8px 10px",
            background: "var(--bg-base)",
            borderLeft: "2px solid var(--ai-accent)",
            borderRadius: "4px",
          }}
        >
          {action.suggestion}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          onClick={createTask}
          disabled={busy !== null}
          style={btnStyle("primary", busy === "task")}
        >
          {busy === "task" ? "Creating…" : "Create Task"}
        </button>
        {showReply && (
          <button onClick={reply} style={btnStyle()}>
            Reply
          </button>
        )}
        {showSchedule && (
          <button onClick={schedule} style={btnStyle()}>
            Schedule
          </button>
        )}
        {done && (
          <span style={{ fontSize: "12px", color: "var(--text-3)", alignSelf: "center" }}>
            {done}
          </span>
        )}
      </div>
    </div>
  )
}

function btnStyle(variant: "default" | "primary" = "default", busy = false): React.CSSProperties {
  const isPrimary = variant === "primary"
  return {
    fontSize: "12px",
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: "6px",
    border: `1px solid ${isPrimary ? "var(--ai-border)" : "var(--border)"}`,
    background: isPrimary ? "var(--ai-accent-dim)" : "var(--bg-base)",
    color: isPrimary ? "var(--ai-accent)" : "var(--text-2)",
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.6 : 1,
    transition: "background 0.15s, border-color 0.15s",
  }
}
