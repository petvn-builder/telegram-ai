"use client"

import type { ContextItem } from "@/lib/assistant/context"
import type { BriefAction } from "@/lib/assistant/brief"
import ActionCard from "./ActionCard"

type Props = {
  title: string
  ids: string[]
  itemsById: Record<string, ContextItem>
  actionsByItemId: Record<string, BriefAction>
  emptyText?: string
  accent?: "urgent" | "important" | "opportunity"
}

const ACCENT_COLORS: Record<NonNullable<Props["accent"]>, string> = {
  urgent: "var(--accent)",
  important: "var(--text-2)",
  opportunity: "var(--ai-accent)",
}

export default function AttentionSection({
  title,
  ids,
  itemsById,
  actionsByItemId,
  emptyText,
  accent = "important",
}: Props) {
  const items = ids.map((id) => itemsById[id]).filter(Boolean)

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "8px",
        }}
      >
        <h2
          style={{
            fontSize: "13px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: ACCENT_COLORS[accent],
            margin: 0,
          }}
        >
          {title}
        </h2>
        <span style={{ fontSize: "12px", color: "var(--text-3)" }}>
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            fontSize: "13px",
            color: "var(--text-3)",
            padding: "16px",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "10px",
            textAlign: "center",
          }}
        >
          {emptyText ?? "Nothing here."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {items.map((item) => (
            <ActionCard
              key={item.id}
              item={item}
              action={actionsByItemId[item.id]}
            />
          ))}
        </div>
      )}
    </section>
  )
}
