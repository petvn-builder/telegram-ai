"use client"

type Props = {
  brief: string
  priorities: string[]
  generatedAt: string
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function TodayBrief({ brief, priorities, generatedAt }: Props) {
  return (
    <div
      style={{
        background: "var(--ai-accent-dim)",
        border: "1px solid var(--ai-border)",
        borderRadius: "14px",
        padding: "24px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "12px",
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ai-accent)",
          }}
        >
          Today's Brief
        </span>
        <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
          updated {relativeTime(generatedAt)}
        </span>
      </div>
      <p
        style={{
          fontSize: "16px",
          lineHeight: 1.65,
          color: "var(--text-1)",
          margin: "0 0 16px",
        }}
      >
        {brief || "No summary available."}
      </p>
      {priorities.length > 0 && (
        <ul
          style={{
            margin: 0,
            paddingLeft: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {priorities.map((p, i) => (
            <li
              key={i}
              style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.55 }}
            >
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
