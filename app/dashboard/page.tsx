"use client"

import { useEffect, useState } from "react"
import DashboardLinks from "./DashboardLinks"
import CalendarSidebar from "./CalendarSidebar"

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function getToday() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
}

export default function DashboardPage() {
  const [me, setMe] = useState<{ email: string | null; hasIdentity: boolean } | null>(null)

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.ok ? r.json() : null)
      .then(setMe)
      .catch(() => {})
  }, [])

  const firstName = me?.email?.split("@")[0] ?? ""

  return (
    <div
      className="page-fade-in"
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        padding: "48px 48px",
      }}
    >
      <div className="calendar-layout">
        {/* Left: main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ marginBottom: "32px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px" }}>
              <h1 style={{
                fontSize: "26px",
                fontWeight: 600,
                color: "var(--text-1)",
                margin: 0,
                letterSpacing: "-0.025em",
              }}>
                {getGreeting()}{firstName ? `, ${firstName}` : ""}
              </h1>
              <p style={{ fontSize: "13px", color: "var(--text-3)", margin: 0, flexShrink: 0 }}>
                {getToday()}
              </p>
            </div>
            <p style={{ fontSize: "14px", color: "var(--text-3)", margin: "5px 0 0" }}>
              Here&apos;s your focus for today.
            </p>
          </div>

          {/* Telegram banner — only when not connected, fades in after /api/me resolves */}
          {me && !me.hasIdentity && (
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              padding: "14px 18px",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              marginBottom: "24px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--text-3)", flexShrink: 0 }} />
                <p style={{ fontSize: "13px", color: "var(--text-2)", margin: 0 }}>
                  Connect Telegram to save notes from your phone
                </p>
              </div>
              <a href="/settings" style={{
                flexShrink: 0,
                padding: "5px 12px",
                background: "transparent",
                border: "1px solid var(--border-hover)",
                borderRadius: "7px",
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--text-1)",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}>
                Connect →
              </a>
            </div>
          )}

          {/* Main widgets */}
          <DashboardLinks />
        </div>

        {/* Right: calendar panel */}
        <div className="calendar-sidebar-col">
          <CalendarSidebar />
        </div>
      </div>
    </div>
  )
}
