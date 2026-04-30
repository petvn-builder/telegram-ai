"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import TodayBrief from "@/app/components/assistant/TodayBrief"
import AttentionSection from "@/app/components/assistant/AttentionSection"
import type { ContextItem } from "@/lib/assistant/context"
import type { BriefAction } from "@/lib/assistant/brief"
import type { SourceStatus } from "@/lib/mcp/client"

type BriefResponse = {
  brief: string
  priorities: string[]
  sections: { urgent: string[]; important: string[]; opportunity: string[] }
  actions: BriefAction[]
  items: ContextItem[]
  sources: { gmail: SourceStatus; calendar: SourceStatus; tasks: SourceStatus; notes: SourceStatus }
  generatedAt: string
}

export default function AssistantPage() {
  const { data, error, isLoading, mutate } = useSWR<BriefResponse>(
    "/api/assistant/brief",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
      // Cache forever within the SWR client; only manual mutate() or a full
      // page reload triggers a refetch.
      dedupingInterval: 24 * 60 * 60 * 1000,
      keepPreviousData: true,
    }
  )

  return (
    <div
      className="page-fade-in"
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        padding: "48px 48px",
      }}
    >
      <div style={{ maxWidth: "880px", margin: "0 auto" }}>
        <Header onRefresh={() => mutate()} loading={isLoading} />

        {error && <ErrorBox onRetry={() => mutate()} />}

        {data && <ConnectBanners sources={data.sources} />}

        {!data && isLoading && <LoadingSkeleton />}

        {data && (
          <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
            <TodayBrief
              brief={data.brief}
              priorities={data.priorities}
              generatedAt={data.generatedAt}
            />
            <Sections data={data} />
          </div>
        )}
      </div>
    </div>
  )
}

function Header({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: "28px",
      }}
    >
      <div>
        <h1
          style={{
            fontSize: "26px",
            fontWeight: 600,
            color: "var(--text-1)",
            margin: 0,
            letterSpacing: "-0.025em",
          }}
        >
          Assistant
        </h1>
        <p style={{ fontSize: "13px", color: "var(--text-3)", margin: "4px 0 0" }}>
          {today} · decisions, not browsing
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        style={{
          fontSize: "12px",
          fontWeight: 500,
          padding: "6px 12px",
          borderRadius: "6px",
          border: "1px solid var(--border)",
          background: "var(--bg-surface)",
          color: "var(--text-2)",
          cursor: loading ? "wait" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  )
}

function Sections({ data }: { data: BriefResponse }) {
  const itemsById: Record<string, ContextItem> = {}
  for (const i of data.items) itemsById[i.id] = i
  const actionsByItemId: Record<string, BriefAction> = {}
  for (const a of data.actions) actionsByItemId[a.itemId] = a

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      <AttentionSection
        title="Urgent"
        ids={data.sections.urgent}
        itemsById={itemsById}
        actionsByItemId={actionsByItemId}
        emptyText="Nothing urgent. Nice."
        accent="urgent"
      />
      <AttentionSection
        title="Important"
        ids={data.sections.important}
        itemsById={itemsById}
        actionsByItemId={actionsByItemId}
        emptyText="No follow-ups queued."
        accent="important"
      />
      <AttentionSection
        title="Opportunity"
        ids={data.sections.opportunity}
        itemsById={itemsById}
        actionsByItemId={actionsByItemId}
        emptyText="Use the quiet — block focus time."
        accent="opportunity"
      />
    </div>
  )
}

function ConnectBanners({ sources }: { sources: BriefResponse["sources"] }) {
  const disconnected: string[] = []
  if (sources.gmail === "disconnected") disconnected.push("Gmail")
  if (sources.calendar === "disconnected") disconnected.push("Calendar")
  if (disconnected.length === 0) return null

  return (
    <div
      style={{
        marginBottom: "20px",
        padding: "14px 18px",
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
      }}
    >
      <p style={{ fontSize: "13px", color: "var(--text-2)", margin: 0 }}>
        Connect {disconnected.join(" and ")} to get the full brief.
      </p>
      <a
        href="/settings/integrations"
        style={{
          flexShrink: 0,
          padding: "5px 12px",
          border: "1px solid var(--border-hover)",
          borderRadius: "7px",
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--text-1)",
          textDecoration: "none",
        }}
      >
        Connect →
      </a>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
        padding: "24px",
        color: "var(--text-3)",
        fontSize: "14px",
      }}
    >
      Composing your brief…
    </div>
  )
}

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid var(--border)",
        borderRadius: "10px",
        background: "var(--bg-surface)",
        color: "var(--text-2)",
        fontSize: "13px",
        marginBottom: "20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>Couldn&apos;t load your brief.</span>
      <button
        onClick={onRetry}
        style={{
          fontSize: "12px",
          padding: "5px 10px",
          border: "1px solid var(--border-hover)",
          borderRadius: "6px",
          background: "transparent",
          cursor: "pointer",
          color: "var(--text-1)",
        }}
      >
        Retry
      </button>
    </div>
  )
}
