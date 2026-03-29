"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import Sidebar from "./Sidebar"
import { useSidebar } from "./SidebarContext"

const FloatingButton = dynamic(() => import("./FloatingButton"), { ssr: false })
const ChatModal = dynamic(() => import("./ChatModal"), { ssr: false })
const CommandBar = dynamic(() => import("./CommandBar"), { ssr: false })

const AUTH_PATHS = ["/login", "/signup"]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  const { isCollapsed, toggle, openMobile, isMobile } = useSidebar()

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg-base)",
      }}
    >
      {/* Mobile top bar — CSS class hides it above 768px */}
      <div className="mobile-topbar">
        <button
          onClick={openMobile}
          title="Open menu"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-2)",
            display: "flex",
            alignItems: "center",
            padding: "6px",
            borderRadius: "8px",
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <Link
          href="/dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            textDecoration: "none",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: "var(--accent)" }}>
            <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          </svg>
          <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-1)", letterSpacing: "-0.015em" }}>Brain</span>
        </Link>
      </div>

      <Sidebar />

      {/* Desktop floating re-open button when sidebar is collapsed */}
      {!isMobile && isCollapsed && (
        <button
          onClick={toggle}
          title="Open sidebar"
          style={{
            position: "fixed",
            top: "18px",
            left: "14px",
            zIndex: 49,
            width: "32px",
            height: "32px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-sidebar)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            cursor: "pointer",
            color: "var(--text-2)",
            transition: "color 0.16s, background 0.16s",
            boxShadow: "var(--shadow-sm)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--text-1)"
            e.currentTarget.style.background = "var(--bg-hover)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-2)"
            e.currentTarget.style.background = "var(--bg-sidebar)"
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      <main
        style={{
          flex: 1,
          marginLeft: isMobile ? "0" : (isCollapsed ? "0" : "var(--sidebar-w)"),
          marginTop: isMobile ? "48px" : "0",
          marginRight: "0",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          transition: "margin-left 200ms ease-in-out",
        }}
      >
        {children}
      </main>

      {/* Floating AI chat bubble + modal */}
      <FloatingButton />
      <ChatModal />

      {/* Command Bar — client-only, hidden until ⌘K */}
      <CommandBar />
    </div>
  )
}
