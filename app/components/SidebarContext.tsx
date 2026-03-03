"use client"

import { createContext, useContext, useState, useCallback, useEffect } from "react"

interface SidebarContextValue {
  isCollapsed: boolean
  toggle: () => void
  isMobileOpen: boolean
  openMobile: () => void
  closeMobile: () => void
  isMobile: boolean
}

const SidebarContext = createContext<SidebarContextValue>({
  isCollapsed: false,
  toggle: () => {},
  isMobileOpen: false,
  openMobile: () => {},
  closeMobile: () => {},
  isMobile: false,
})

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Read persisted collapse state after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed")
    if (stored === "true") setIsCollapsed(true)
  }, [])

  // Track mobile breakpoint
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  // Close mobile drawer when transitioning to desktop
  useEffect(() => {
    if (!isMobile) setIsMobileOpen(false)
  }, [isMobile])

  const toggle = useCallback(() => {
    setIsCollapsed((v) => {
      const next = !v
      localStorage.setItem("sidebar-collapsed", String(next))
      return next
    })
  }, [])

  const openMobile = useCallback(() => setIsMobileOpen(true), [])
  const closeMobile = useCallback(() => setIsMobileOpen(false), [])

  return (
    <SidebarContext.Provider value={{ isCollapsed, toggle, isMobileOpen, openMobile, closeMobile, isMobile }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
