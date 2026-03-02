"use client"

import { usePathname } from "next/navigation"
import { lazy, Suspense } from "react"
import Sidebar from "./Sidebar"
import { useAiPanel } from "./AiPanelContext"

const AiPanel = lazy(() => import("./AiPanel"))
const CommandBar = lazy(() => import("./CommandBar"))

const AUTH_PATHS = ["/login", "/signup"]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))
  const { isOpen: aiPanelOpen } = useAiPanel()

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <div
      className={aiPanelOpen ? "ai-panel-open" : undefined}
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg-base)",
      }}
    >
      <Sidebar />
      <main
        style={{
          flex: 1,
          marginLeft: "var(--sidebar-w)",
          marginRight: aiPanelOpen ? "var(--ai-panel-w)" : "0",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          transition: "margin-right 220ms ease-in-out",
        }}
      >
        {children}
      </main>

      {/* AI Panel — lazy loaded, only mounts when open */}
      <Suspense fallback={null}>
        {aiPanelOpen && <AiPanel />}
      </Suspense>

      {/* Command Bar — always mounted, hidden until ⌘K */}
      <Suspense fallback={null}>
        <CommandBar />
      </Suspense>
    </div>
  )
}
