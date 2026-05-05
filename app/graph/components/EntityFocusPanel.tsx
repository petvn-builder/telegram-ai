"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useAiPanel } from "@/app/components/AiPanelContext"
import type { ClusterDetailResponse } from "@/app/api/graph/cluster/[id]/route"
import type { RankedCluster } from "@/lib/graph/clusterRank"
import type { Insight } from "@/app/api/graph/insights/route"

type Tab = "summary" | "notes" | "insights"

type Props = {
  cluster: RankedCluster
  detail: ClusterDetailResponse
  selectedEntityId: string | null
  insights: Insight[]
  onCreateTask: (title: string) => void
  onPickEntity: (entityId: string) => void
}

const INSIGHT_ICON: Record<Insight["type"], string> = {
  hidden_connection: "🔗",
  knowledge_gap: "🕳",
  trending_topic: "📈",
  orphan_alert: "⚠",
  timeline_conflict: "⏰",
}

export function EntityFocusPanel({ cluster, detail, selectedEntityId, insights, onCreateTask, onPickEntity }: Props) {
  const [tab, setTab] = useState<Tab>("summary")
  const ai = useAiPanel()

  const entity = useMemo(
    () => detail.entities.find((e) => e.id === selectedEntityId) ?? null,
    [detail, selectedEntityId]
  )

  const notes = useMemo(() => {
    if (!selectedEntityId) return detail.notePreviews
    return detail.notePreviews.filter((n) => n.entityIds.includes(selectedEntityId))
  }, [detail, selectedEntityId])

  return (
    <aside
      style={{
        width: 360,
        flexShrink: 0,
        borderLeft: "1px solid var(--border)",
        background: "var(--bg-surface)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header style={{ padding: "16px 18px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-3)", marginBottom: 4 }}>
          {entity ? `Entity · ${entity.entityType}` : "Cluster"}
        </div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "var(--text-1)" }}>
          {entity?.label ?? cluster.label ?? cluster.hubEntityName}
        </h2>
        {!entity && (
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-3)" }}>
            {cluster.memberCount} entities · {detail.notePreviews.length} notes
          </div>
        )}
      </header>

      <nav
        style={{
          display: "flex",
          gap: 0,
          padding: "0 18px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {(["summary", "notes", "insights"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none",
              border: "none",
              padding: "10px 0",
              marginRight: 16,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: tab === t ? 600 : 500,
              color: tab === t ? "var(--text-1)" : "var(--text-3)",
              borderBottom: tab === t ? "2px solid var(--accent)" : "2px solid transparent",
            }}
          >
            {t === "summary" ? "Summary" : t === "notes" ? `Notes (${notes.length})` : "Insights"}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "summary" && (
          <SummaryTab entityId={entity?.id ?? null} clusterLabel={cluster.label ?? cluster.hubEntityName} entityIdsInCluster={cluster.entityIds.length} />
        )}
        {tab === "notes" && <NotesTab notes={notes} />}
        {tab === "insights" && (
          <InsightsTab
            insights={insights}
            cluster={cluster}
            entityIdsInCluster={cluster.entityIds}
            entityNameById={Object.fromEntries(detail.entities.map((e) => [e.id, e.label]))}
            onPickEntity={onPickEntity}
          />
        )}
      </div>

      <footer
        style={{
          padding: 14,
          borderTop: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button
          disabled={!entity}
          onClick={() => entity && onCreateTask(entity.label)}
          style={actionStyle(!!entity)}
        >
          ＋ Create task from {entity?.label ?? "…"}
        </button>
        {entity ? (
          <Link href={`/notes?entity=${entity.id}`} style={{ ...actionStyle(true), textDecoration: "none", textAlign: "center" }}>
            Open notes
          </Link>
        ) : (
          <button disabled style={actionStyle(false)}>Open notes</button>
        )}
        <button
          onClick={() => {
            const memberNames = detail.entities.slice(0, 8).map((e) => e.label).join(", ")
            ai.sendCommand(
              `Tell me about the "${cluster.label ?? cluster.hubEntityName}" cluster — entities: ${memberNames}.`
            )
          }}
          style={{ ...actionStyle(true), borderColor: "var(--ai-border)", color: "var(--ai-accent)" }}
        >
          Ask AI about this cluster
        </button>
      </footer>
    </aside>
  )
}

function actionStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 500,
    background: "var(--bg-elevated)",
    color: enabled ? "var(--text-1)" : "var(--text-3)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    cursor: enabled ? "pointer" : "not-allowed",
    textAlign: "left",
    opacity: enabled ? 1 : 0.5,
  }
}

function SummaryTab({
  entityId,
  clusterLabel,
  entityIdsInCluster,
}: {
  entityId: string | null
  clusterLabel: string
  entityIdsInCluster: number
}) {
  const [summary, setSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!entityId) {
      setSummary(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setSummary(null)
    fetch(`/api/entities/${entityId}/summary`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => {
        if (!cancelled) setSummary(typeof d.summary === "string" ? d.summary : null)
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [entityId])

  if (!entityId) {
    return (
      <div style={{ padding: 18, fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>
          You're viewing the <strong>{clusterLabel}</strong> cluster ({entityIdsInCluster} entities). Click any entity in the graph to see its summary.
        </p>
      </div>
    )
  }
  if (loading) return <div style={{ padding: 18, fontSize: 13, color: "var(--text-3)" }}>Loading summary…</div>
  if (!summary) return <div style={{ padding: 18, fontSize: 13, color: "var(--text-3)" }}>No summary yet.</div>
  return (
    <div style={{ padding: 18, fontSize: 13, color: "var(--text-1)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
      {summary}
    </div>
  )
}

function NotesTab({ notes }: { notes: { id: string; content: string; created_at: string | null }[] }) {
  if (notes.length === 0) {
    return <div style={{ padding: 18, fontSize: 13, color: "var(--text-3)" }}>No notes for this entity.</div>
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {notes.map((n) => (
        <li key={n.id} style={{ borderBottom: "1px solid var(--border)" }}>
          <Link
            href={`/notes?open=${n.id}`}
            style={{
              display: "block",
              padding: "12px 18px",
              fontSize: 13,
              color: "var(--text-2)",
              textDecoration: "none",
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 4 }}>
              {n.created_at ? new Date(n.created_at).toLocaleDateString() : ""}
            </div>
            {n.content.length > 140 ? n.content.slice(0, 140).trimEnd() + "…" : n.content}
          </Link>
        </li>
      ))}
    </ul>
  )
}

function InsightsTab({
  insights,
  cluster,
  entityIdsInCluster,
  entityNameById,
  onPickEntity,
}: {
  insights: Insight[]
  cluster: RankedCluster
  entityIdsInCluster: string[]
  entityNameById: Record<string, string>
  onPickEntity: (entityId: string) => void
}) {
  const memberSet = new Set(entityIdsInCluster)
  const scoped = insights.filter((i) => i.entity_ids.some((e) => memberSet.has(e)))

  if (scoped.length === 0) {
    return (
      <div style={{ padding: 18, fontSize: 13, color: "var(--text-3)", lineHeight: 1.6 }}>
        No insights touch this cluster yet.
      </div>
    )
  }
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {scoped.map((ins) => {
        const localEntities = ins.entity_ids.filter((e) => memberSet.has(e))
        return (
          <li
            key={ins.id}
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--border)",
              fontSize: 13,
              color: "var(--text-1)",
              lineHeight: 1.5,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
              <span style={{ fontSize: 14, lineHeight: 1.4 }}>{INSIGHT_ICON[ins.type] ?? "·"}</span>
              <strong style={{ fontSize: 13, fontWeight: 600 }}>{ins.title}</strong>
            </div>
            <div style={{ color: "var(--text-2)", marginBottom: 8 }}>{ins.description}</div>
            {localEntities.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {localEntities.map((eid) => (
                  <button
                    key={eid}
                    onClick={() => onPickEntity(eid)}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 10,
                      background: "var(--accent-dim, rgba(212,119,92,0.12))",
                      color: "var(--text-1)",
                      border: "1px solid var(--border)",
                      cursor: "pointer",
                    }}
                  >
                    {entityNameById[eid] ?? "entity"}
                  </button>
                ))}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
