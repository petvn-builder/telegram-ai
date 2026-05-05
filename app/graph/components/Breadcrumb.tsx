"use client"

type Crumb = { label: string; onClick?: () => void }

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 13,
        color: "var(--text-2)",
      }}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {item.onClick && !isLast ? (
              <button
                onClick={item.onClick}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--text-2)",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-1)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-2)")}
              >
                {item.label}
              </button>
            ) : (
              <span style={{ color: isLast ? "var(--text-1)" : "var(--text-2)", fontWeight: isLast ? 600 : 500 }}>
                {item.label}
              </span>
            )}
            {!isLast && <span style={{ color: "var(--text-3)" }}>/</span>}
          </span>
        )
      })}
    </nav>
  )
}
