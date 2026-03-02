"use client"

import { usePathname } from "next/navigation"
import dynamic from "next/dynamic"
import Sidebar from "./Sidebar"
import { useAiPanel } from "./AiPanelContext"

const AiPanel = dynamic(() => import("./AiPanel"), { ssr: false })
const CommandBar = dynamic(() => import("./CommandBar"), { ssr: false })

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

      {/* AI Panel — client-only, only mounts when open */}
      {aiPanelOpen && <AiPanel />}

      {/* Command Bar — client-only, hidden until ⌘K */}
      <CommandBar />
    </div>
  )
}
