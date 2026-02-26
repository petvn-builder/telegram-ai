"use client"

import { usePathname } from "next/navigation"
import Sidebar from "./Sidebar"

const AUTH_PATHS = ["/login", "/signup"]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))

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
      <Sidebar />
      <main
        style={{
          flex: 1,
          marginLeft: "var(--sidebar-w)",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </main>
    </div>
  )
}
