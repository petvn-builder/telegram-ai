"use client"

import Link from "next/link"

const LINKS = [
  { href: "/graph",    label: "Knowledge Graph", desc: "Visualize connections", icon: "⬡" },
  { href: "/notes",    label: "Notes",            desc: "Browse saved notes",   icon: "◻" },
  { href: "/settings", label: "Settings",         desc: "Account & Telegram",   icon: "◈" },
]

export default function DashboardLinks() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
      {LINKS.map(({ href, label, desc, icon }) => (
        <Link
          key={href}
          href={href}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "20px",
            textDecoration: "none",
            transition: "border-color 0.15s, background 0.15s",
            display: "block",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.12)"
            ;(e.currentTarget as HTMLElement).style.background = "var(--bg-card)"
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"
            ;(e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"
          }}
        >
          <div style={{ fontSize: "20px", marginBottom: "10px" }}>{icon}</div>
          <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-1)", margin: "0 0 4px" }}>
            {label}
          </p>
          <p style={{ fontSize: "11px", color: "var(--text-3)", margin: 0 }}>{desc}</p>
        </Link>
      ))}
    </div>
  )
}
