"use client"

import Link from "next/link"

const LINKS = [
  {
    href: "/notes",
    label: "Notes",
    desc: "Browse and search all your saved notes from Telegram",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
    color: "#818cf8",
    colorBg: "rgba(99,102,241,0.10)",
    colorBorder: "rgba(99,102,241,0.20)",
  },
  {
    href: "/graph",
    label: "Knowledge Graph",
    desc: "Visualize connections between entities and ideas",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="2" />
        <circle cx="5" cy="19" r="2" />
        <circle cx="19" cy="19" r="2" />
        <line x1="12" y1="7" x2="5" y2="17" />
        <line x1="12" y1="7" x2="19" y2="17" />
        <line x1="5" y1="17" x2="19" y2="17" />
      </svg>
    ),
    color: "#34d399",
    colorBg: "rgba(16,185,129,0.10)",
    colorBorder: "rgba(16,185,129,0.20)",
  },
  {
    href: "/settings",
    label: "Settings",
    desc: "Manage your account and Telegram connection",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
    color: "#fbbf24",
    colorBg: "rgba(245,158,11,0.10)",
    colorBorder: "rgba(245,158,11,0.20)",
  },
]

export default function DashboardLinks() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: "12px",
      }}
    >
      {LINKS.map(({ href, label, desc, icon, color, colorBg, colorBorder }) => (
        <Link
          key={href}
          href={href}
          className="card-lift"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            padding: "24px",
            textDecoration: "none",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            transition: "border-color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)"
            ;(e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.borderColor = "var(--border)"
            ;(e.currentTarget as HTMLElement).style.background = "var(--bg-surface)"
          }}
        >
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "10px",
              background: colorBg,
              border: `1px solid ${colorBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: color,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>

          <div>
            <p
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "var(--text-1)",
                margin: "0 0 5px",
                letterSpacing: "-0.01em",
              }}
            >
              {label}
            </p>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-2)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              {desc}
            </p>
          </div>

          <div
            style={{
              marginTop: "auto",
              fontSize: "13px",
              color: "var(--text-3)",
            }}
          >
            →
          </div>
        </Link>
      ))}
    </div>
  )
}
