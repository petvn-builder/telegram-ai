"use client"

import { useState } from "react"
import type { ContextItem } from "@/lib/assistant/context"
import type {
  BriefAction,
  BriefActionStep,
  CreateTaskPayload,
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
  const replyStep = pickReplyStep(action)

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

      {item.type === "email" && item.content && (
        <IncomingEmailPreview item={item} />
      )}

      {replyStep && (
        <ReplyComposer
          step={replyStep}
          item={item}
          secondary={action?.secondary}
        />
      )}

      {!replyStep && action && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <ActionButton step={action.primary} variant="primary" />
          {action.secondary && (
            <ActionButton step={action.secondary} variant="secondary" />
          )}
          <ConfidencePill value={action.confidence} />
        </div>
      )}
    </div>
  )
}

function senderLabel(from: string): string {
  const m = from.match(/^([^<]+)<([^>]+)>$/)
  if (m) return m[1].trim().replace(/^"|"$/g, "")
  return from
}

function IncomingEmailPreview({ item }: { item: ContextItem }) {
  const [open, setOpen] = useState(false)
  const from = item.metadata?.from
  const senderName = from ? senderLabel(from) : null
  return (
    <div
      style={{
        background: "var(--bg-base)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "8px",
        padding: "10px 12px",
        fontSize: "12px",
        color: "var(--text-2)",
        lineHeight: 1.55,
      }}
    >
      {senderName && (
        <div
          style={{
            fontSize: "11px",
            color: "var(--text-3)",
            marginBottom: "4px",
          }}
        >
          From <span style={{ color: "var(--text-2)" }}>{senderName}</span>
          {item.createdAt && (
            <span> · {new Date(item.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
          )}
        </div>
      )}
      <div
        style={{
          whiteSpace: "pre-wrap",
          color: "var(--text-2)",
          maxHeight: open ? undefined : "4.4em",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {item.content}
      </div>
      {item.content.length > 200 && (
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            marginTop: "4px",
            fontSize: "11px",
            border: "none",
            background: "transparent",
            color: "var(--text-3)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {open ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}

function pickReplyStep(action?: BriefAction): BriefActionStep & { type: "reply_email" } | null {
  if (action?.primary.type === "reply_email") return action.primary
  if (action?.secondary?.type === "reply_email") return action.secondary
  return null
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

function ReplyComposer({
  step,
  item,
  secondary,
}: {
  step: BriefActionStep & { type: "reply_email" }
  item: ContextItem
  secondary?: BriefActionStep
}) {
  const [draft, setDraft] = useState(step.payload.draft)
  const [editing, setEditing] = useState(false)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<{ kind: "ok" | "error"; msg: string } | null>(null)

  const threadId = step.payload.threadId || item.metadata?.threadId
  const canSend = !!threadId && draft.trim().length > 0

  async function send() {
    if (!canSend) return
    setSending(true)
    setStatus(null)
    try {
      const res = await fetch("/api/assistant/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId,
          draft,
          subject: step.payload.subject ?? item.title,
          to: step.payload.to ?? item.metadata?.from,
        }),
      })
      if (res.ok) {
        setStatus({ kind: "ok", msg: "Sent · reply on thread" })
      } else {
        const j = await res.json().catch(() => ({}))
        const reconnect = j.code === "scope_error"
        setStatus({
          kind: "error",
          msg: reconnect
            ? "Reconnect Google to enable send"
            : j.error ?? "Send failed",
        })
      }
    } catch (e) {
      setStatus({
        kind: "error",
        msg: e instanceof Error ? e.message : "Send failed",
      })
    } finally {
      setSending(false)
    }
  }

  const sent = status?.kind === "ok"

  return (
    <div
      style={{
        background: "var(--ai-accent-dim)",
        borderLeft: "2px solid var(--ai-accent)",
        borderRadius: "4px",
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span
          style={{
            color: "var(--ai-accent)",
            fontWeight: 500,
            fontSize: "11px",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          Drafted reply
        </span>
        {!sent && (
          <button
            onClick={() => setEditing((v) => !v)}
            style={textBtnStyle()}
            disabled={sending}
          >
            {editing ? "Done editing" : "Edit"}
          </button>
        )}
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.max(4, draft.split("\n").length + 1)}
          style={{
            width: "100%",
            fontSize: "13px",
            lineHeight: 1.55,
            padding: "8px 10px",
            border: "1px solid var(--ai-border)",
            borderRadius: "6px",
            background: "var(--bg-surface)",
            color: "var(--text-1)",
            fontFamily: "inherit",
            resize: "vertical",
          }}
          disabled={sending || sent}
        />
      ) : (
        <p
          style={{
            margin: 0,
            whiteSpace: "pre-wrap",
            color: "var(--text-1)",
            lineHeight: 1.55,
            fontSize: "13px",
          }}
        >
          {draft}
        </p>
      )}

      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        {!sent && (
          <button
            onClick={send}
            disabled={sending || !canSend}
            style={btnStyle("primary", sending)}
          >
            {sending ? "Sending…" : step.label || "Send reply"}
          </button>
        )}
        {secondary && !sent && (
          <ActionButton step={secondary} variant="secondary" />
        )}
        {status && (
          <span
            style={{
              fontSize: "12px",
              color: status.kind === "ok" ? "var(--ai-accent)" : "var(--accent)",
            }}
          >
            {status.msg}
          </span>
        )}
      </div>
    </div>
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
  variant,
}: {
  step: BriefActionStep
  variant: "primary" | "secondary"
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: "ok" | "error"; msg: string } | null>(null)

  async function run() {
    setBusy(true)
    setStatus(null)
    try {
      switch (step.type) {
        case "reply_email":
          // Reply is handled by ReplyComposer; this is a fallback.
          break
        case "create_task": {
          const ok = await postCreateTask(step.payload)
          setStatus({ kind: ok ? "ok" : "error", msg: ok ? "Task created" : "Failed" })
          break
        }
        case "view_task":
          window.location.href = `/tasks?focus=${encodeURIComponent(step.payload.taskId)}`
          break
        case "schedule_time": {
          const result = await postSchedule(step.payload)
          setStatus(result)
          break
        }
        case "review_note":
          window.location.href = `/notes?open=${encodeURIComponent(step.payload.noteId)}`
          break
      }
    } finally {
      setBusy(false)
    }
  }

  const isDone = status?.kind === "ok"

  return (
    <>
      <button onClick={run} disabled={busy || isDone} style={btnStyle(variant, busy)}>
        {busy ? "Working…" : isDone ? "Done" : step.label}
      </button>
      {status && (
        <span
          style={{
            fontSize: "12px",
            color: status.kind === "ok" ? "var(--ai-accent)" : "var(--accent)",
          }}
        >
          {status.msg}
        </span>
      )}
      {step.type === "schedule_time" && step.payload.suggestedSlot && !status && (
        <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
          {formatSlot(step.payload.suggestedSlot)} · {step.payload.duration}m
        </span>
      )}
    </>
  )
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

async function postSchedule(
  payload: ScheduleTimePayload
): Promise<{ kind: "ok" | "error"; msg: string }> {
  if (!payload.suggestedSlot) {
    return { kind: "error", msg: "No slot suggested" }
  }
  try {
    const res = await fetch("/api/assistant/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title,
        suggestedSlot: payload.suggestedSlot,
        duration: payload.duration,
      }),
    })
    if (res.ok) {
      return { kind: "ok", msg: "Event created" }
    }
    const j = await res.json().catch(() => ({}))
    if (j.code === "scope_error") {
      return { kind: "error", msg: "Reconnect Google to enable" }
    }
    return { kind: "error", msg: j.error ?? "Failed" }
  } catch (e) {
    return {
      kind: "error",
      msg: e instanceof Error ? e.message : "Failed",
    }
  }
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

function textBtnStyle(): React.CSSProperties {
  return {
    fontSize: "11px",
    padding: "2px 6px",
    border: "none",
    background: "transparent",
    color: "var(--ai-accent)",
    cursor: "pointer",
    textDecoration: "underline",
  }
}
