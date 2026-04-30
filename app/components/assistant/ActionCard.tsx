"use client"

import { useState } from "react"
import type { ContextItem } from "@/lib/assistant/context"
import type {
  BriefAction,
  BriefActionStep,
  CreateTaskPayload,
  ReplyEmailPayload,
  ScheduleTimePayload,
} from "@/lib/assistant/brief"

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

function formatSlot(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default function ActionCard({ item, action }: Props) {
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
      <CardHeader item={item} />

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

      {action?.primary.type === "reply_email" && (
        <DraftPreview draft={action.primary.payload.draft} />
      )}

      {action && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <ActionButton step={action.primary} item={item} variant="primary" />
          {action.secondary && (
            <ActionButton step={action.secondary} item={item} variant="secondary" />
          )}
          <ConfidencePill value={action.confidence} />
        </div>
      )}
    </div>
  )
}

function CardHeader({ item }: { item: ContextItem }) {
  return (
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
  )
}

function DraftPreview({ draft }: { draft: string }) {
  return (
    <details
      style={{
        fontSize: "13px",
        background: "var(--ai-accent-dim)",
        borderLeft: "2px solid var(--ai-accent)",
        borderRadius: "4px",
        padding: "8px 10px",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          color: "var(--ai-accent)",
          fontWeight: 500,
          fontSize: "12px",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        Drafted reply
      </summary>
      <p
        style={{
          margin: "8px 0 0",
          whiteSpace: "pre-wrap",
          color: "var(--text-1)",
          lineHeight: 1.55,
        }}
      >
        {draft}
      </p>
    </details>
  )
}

function ConfidencePill({ value }: { value: number }) {
  return (
    <span
      style={{
        fontSize: "10px",
        color: "var(--text-3)",
        marginLeft: "auto",
        fontVariantNumeric: "tabular-nums",
      }}
      title="LLM confidence"
    >
      {Math.round(value * 100)}%
    </span>
  )
}

function ActionButton({
  step,
  item,
  variant,
}: {
  step: BriefActionStep
  item: ContextItem
  variant: "primary" | "secondary"
}) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    try {
      switch (step.type) {
        case "reply_email":
          openMailtoDraft(step.payload, item)
          break
        case "create_task": {
          const ok = await postCreateTask(step.payload)
          setDone(ok ? "Task created" : "Failed")
          break
        }
        case "view_task":
          window.location.href = `/tasks?focus=${encodeURIComponent(step.payload.taskId)}`
          break
        case "schedule_time":
          openSchedule(step.payload)
          break
        case "review_note":
          window.location.href = `/notes?open=${encodeURIComponent(step.payload.noteId)}`
          break
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button onClick={run} disabled={busy} style={btnStyle(variant, busy)}>
        {busy ? "Working…" : step.label}
      </button>
      {done && (
        <span style={{ fontSize: "12px", color: "var(--text-3)" }}>{done}</span>
      )}
      {step.type === "schedule_time" && step.payload.suggestedSlot && (
        <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
          {formatSlot(step.payload.suggestedSlot)} · {step.payload.duration}m
        </span>
      )}
    </>
  )
}

function openMailtoDraft(payload: ReplyEmailPayload, item: ContextItem) {
  const to = payload.to ?? item.metadata?.from ?? ""
  const subjectRaw = payload.subject ?? item.title
  const subject = subjectRaw.startsWith("Re:") ? subjectRaw : `Re: ${subjectRaw}`
  window.location.href =
    `mailto:${encodeURIComponent(to)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(payload.draft)}`
}

async function postCreateTask(payload: CreateTaskPayload): Promise<boolean> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: payload.title,
      description: payload.description,
      due_date: payload.dueDate ?? null,
      status: "next",
    }),
  })
  return res.ok
}

function openSchedule(payload: ScheduleTimePayload) {
  const params = new URLSearchParams({ create: "1", title: payload.title })
  if (payload.suggestedSlot) params.set("when", payload.suggestedSlot)
  window.location.href = `/tasks?${params.toString()}`
}

function btnStyle(
  variant: "primary" | "secondary",
  busy: boolean
): React.CSSProperties {
  const isPrimary = variant === "primary"
  return {
    fontSize: "12px",
    fontWeight: 500,
    padding: isPrimary ? "6px 12px" : "5px 10px",
    borderRadius: "6px",
    border: `1px solid ${isPrimary ? "var(--ai-border)" : "var(--border)"}`,
    background: isPrimary ? "var(--ai-accent-dim)" : "var(--bg-base)",
    color: isPrimary ? "var(--ai-accent)" : "var(--text-2)",
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.6 : 1,
    transition: "background 0.15s, border-color 0.15s",
  }
}
