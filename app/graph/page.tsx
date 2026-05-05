"use client"

import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import type { RankedCluster } from "@/lib/graph/clusterRank"
import type { GraphOverviewResponse, EntityIndexEntry } from "@/app/api/graph/route"
import type { ClusterDetailResponse } from "@/app/api/graph/cluster/[id]/route"
import type { Insight } from "@/app/api/graph/insights/route"
import type { TaskWithEntities } from "@/lib/tasks"
import CreateTaskModal from "@/app/tasks/CreateTaskModal"
import { ClusterOverview } from "./components/ClusterOverview"
import { ClusterDetail } from "./components/ClusterDetail"
import { EntityFocusPanel } from "./components/EntityFocusPanel"
import { Breadcrumb } from "./components/Breadcrumb"
import { GraphSearchBar } from "./components/GraphSearchBar"
import { InsightOverlay } from "./components/InsightOverlay"
import type { PackedBubble } from "./components/packBubbles"

type View =
  | { mode: "overview" }
  | { mode: "cluster"; id: string; focusEntityId: string | null }

const INSIGHTS_CACHE_KEY = "graph_insights_v2"
const INSIGHTS_TTL = 2 * 60 * 60 * 1000

export default function GraphPage() {
  const [overview, setOverview] = useState<GraphOverviewResponse | null>(null)
  const [labelsByClusterId, setLabelsByClusterId] = useState<Record<string, string>>({})
  const [view, setView] = useState<View>({ mode: "overview" })
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<ClusterDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const detailCache = useRef<Record<string, ClusterDetailResponse>>({})
  const [taskModalTitle, setTaskModalTitle] = useState<string | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [insightMode, setInsightMode] = useState(false)
  const [placedBubbles, setPlacedBubbles] = useState<PackedBubble[]>([])

  // Overview fetch + cluster labels
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/graph", { cache: "no-store" })
        if (!res.ok) throw new Error(`graph fetch ${res.status}`)
        const data: GraphOverviewResponse = await res.json()
        if (cancelled) return
        setOverview(data)

        if (data.clusters.length > 0) {
          const cached = readCachedLabels()
          const need = data.clusters.filter((c) => !cached[c.id])
          if (need.length > 0) {
            const labelsRes = await fetch("/api/graph/cluster-labels", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clusters: need.map((c) => ({ id: c.id, entity_ids: c.entityIds })),
              }),
            })
            if (labelsRes.ok) {
              const { labels } = await labelsRes.json()
              const next = { ...cached }
              for (const l of labels) next[l.id] = l.label
              writeCachedLabels(next)
              if (!cancelled) setLabelsByClusterId(next)
              return
            }
          }
          if (!cancelled) setLabelsByClusterId(cached)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load graph")
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Insights — cached in localStorage, fetched lazily on first toggle
  useEffect(() => {
    if (!insightMode) return
    if (insights.length > 0) return
    const cached = readCachedInsights()
    if (cached) {
      setInsights(cached)
      return
    }
    let cancelled = false
    fetch("/api/graph/insights")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d) => {
        if (cancelled) return
        const arr: Insight[] = d.insights ?? []
        setInsights(arr)
        writeCachedInsights(arr)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [insightMode, insights.length])

  // Lazy fetch cluster detail
  useEffect(() => {
    if (view.mode !== "cluster") {
      setDetail(null)
      return
    }
    const cached = detailCache.current[view.id]
    if (cached) {
      setDetail(cached)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    setDetail(null)
    fetch(`/api/graph/cluster/${encodeURIComponent(view.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((d: ClusterDetailResponse) => {
        if (cancelled) return
        detailCache.current[view.id] = d
        setDetail(d)
      })
      .catch((e) => !cancelled && setError(typeof e === "string" ? e : "Failed to load cluster"))
      .finally(() => !cancelled && setDetailLoading(false))
    return () => {
      cancelled = true
    }
  }, [view])

  const decoratedClusters: RankedCluster[] = useMemo(
    () =>
      overview ? overview.clusters.map((c) => ({ ...c, label: labelsByClusterId[c.id] ?? c.label })) : [],
    [overview, labelsByClusterId]
  )

  const entityToClusterId = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of decoratedClusters) {
      for (const eid of c.entityIds) m[eid] = c.id
    }
    return m
  }, [decoratedClusters])

  const activeCluster =
    view.mode === "cluster" ? decoratedClusters.find((c) => c.id === view.id) ?? null : null

  const onSelectCluster = useCallback((id: string) => {
    setView({ mode: "cluster", id, focusEntityId: null })
  }, [])

  const onSelectEntity = useCallback((entityId: string) => {
    setView((v) => (v.mode === "cluster" ? { ...v, focusEntityId: entityId } : v))
  }, [])

  const onBack = useCallback(() => setView({ mode: "overview" }), [])

  const onPickFromSearch = useCallback(
    (entry: EntityIndexEntry) => {
      if (entry.clusterId) {
        setView({ mode: "cluster", id: entry.clusterId, focusEntityId: entry.id })
      }
    },
    []
  )

  const onPlaced = useCallback((p: PackedBubble[]) => setPlacedBubbles(p), [])

  const crumbs = [
    { label: "All clusters", onClick: view.mode === "overview" ? undefined : onBack },
    ...(activeCluster ? [{ label: activeCluster.label ?? activeCluster.hubEntityName }] : []),
  ]

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-base)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "12px 20px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
          flexShrink: 0,
        }}
      >
        <Breadcrumb items={crumbs} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {overview && (
            <GraphSearchBar index={overview.entityIndex} onPick={onPickFromSearch} />
          )}
          <button
            onClick={() => setInsightMode((v) => !v)}
            style={{
              fontSize: 12,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid",
              borderColor: insightMode ? "var(--ai-accent, #5B8A7A)" : "var(--border)",
              background: insightMode ? "var(--ai-accent-dim, rgba(91,138,122,0.12))" : "var(--bg-base)",
              color: insightMode ? "var(--ai-accent, #5B8A7A)" : "var(--text-2)",
              cursor: "pointer",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {insightMode ? "Insight View ●" : "Insight View"}
          </button>
          <div style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>
            {overview ? `${overview.clusters.length} clusters · ${overview.orphanCount} loose` : "Loading…"}
          </div>
        </div>
      </header>

      <main style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <section style={{ position: "relative", flex: 1, overflow: "hidden" }}>
          {error && <div style={{ padding: 24, color: "var(--text-2)" }}>Couldn't load graph: {error}</div>}
          {!error && !overview && <CenterMessage>Loading clusters…</CenterMessage>}
          {!error && overview && view.mode === "overview" && (
            <ClusterOverview
              clusters={decoratedClusters}
              orphanCount={overview.orphanCount}
              onSelect={onSelectCluster}
              onPlaced={onPlaced}
              overlay={
                insightMode && placedBubbles.length > 0 ? (
                  <InsightOverlay
                    placed={placedBubbles}
                    insights={insights}
                    entityToClusterId={entityToClusterId}
                  />
                ) : null
              }
            />
          )}
          {!error && overview && view.mode === "cluster" && (
            <>
              {detailLoading && <CenterMessage>Loading cluster…</CenterMessage>}
              {!detailLoading && detail && activeCluster && (
                <ClusterDetail
                  detail={detail}
                  hubAccentColor={activeCluster.color}
                  selectedEntityId={view.focusEntityId}
                  onSelectEntity={onSelectEntity}
                />
              )}
            </>
          )}
        </section>

        {view.mode === "cluster" && activeCluster && detail && (
          <EntityFocusPanel
            cluster={activeCluster}
            detail={detail}
            selectedEntityId={view.focusEntityId}
            insights={insights}
            onCreateTask={(title) => setTaskModalTitle(title)}
            onPickEntity={onSelectEntity}
          />
        )}
      </main>

      {taskModalTitle !== null && (
        <CreateTaskModal
          initialTitle={taskModalTitle}
          onClose={() => setTaskModalTitle(null)}
          onCreated={(_tasks: TaskWithEntities[]) => setTaskModalTitle(null)}
        />
      )}
    </div>
  )
}

function CenterMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-3)",
        fontSize: 14,
      }}
    >
      {children}
    </div>
  )
}

const LABEL_CACHE_KEY = "graph_cluster_labels_v2"

function readCachedLabels(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LABEL_CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

function writeCachedLabels(labels: Record<string, string>) {
  try {
    localStorage.setItem(LABEL_CACHE_KEY, JSON.stringify(labels))
  } catch {}
}

function readCachedInsights(): Insight[] | null {
  try {
    const raw = localStorage.getItem(INSIGHTS_CACHE_KEY)
    if (!raw) return null
    const { insights, ts } = JSON.parse(raw)
    if (Date.now() - ts > INSIGHTS_TTL) return null
    return insights as Insight[]
  } catch {
    return null
  }
}

function writeCachedInsights(insights: Insight[]) {
  try {
    localStorage.setItem(INSIGHTS_CACHE_KEY, JSON.stringify({ insights, ts: Date.now() }))
  } catch {}
}
