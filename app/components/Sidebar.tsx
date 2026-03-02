"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import useSWR from "swr"
import { getSupabaseBrowser } from "@/lib/supabase/browser"
import type { User } from "@supabase/supabase-js"
import type { Space } from "@/app/notes/types"
import { fetcher } from "@/lib/fetcher"
import { useAiPanel } from "./AiPanelContext"

// ── Icons ─────────────────────────────────────────────────────────────────────

function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function NotesIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function TasksIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

function GraphIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <line x1="12" y1="7" x2="5" y2="17" />
      <line x1="12" y1="7" x2="19" y2="17" />
      <line x1="5" y1="17" x2="19" y2="17" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function SparkleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function LogOutIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

// ── Nav components ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p style={{
      fontSize: "10px",
      fontWeight: 600,
      color: "var(--text-3)",
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      padding: "8px 14px 3px",
      margin: 0,
    }}>
      {label}
    </p>
  )
}

function NavLink({ href, label, icon, isActive }: { href: string; label: string; icon: React.ReactNode; isActive: boolean }) {
  return (
    <Link
      href={href}
      className="nav-link"
      data-active={isActive ? "true" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "8px 14px",
        borderRadius: "8px",
        fontSize: "14px",
        fontWeight: isActive ? 500 : 400,
        color: isActive ? "var(--text-1)" : "var(--text-2)",
        textDecoration: "none",
        background: isActive ? "var(--accent-dim)" : "transparent",
        transition: "color 0.16s ease-in-out, background 0.16s ease-in-out",
      }}
    >
      <span style={{
        color: isActive ? "var(--accent)" : "var(--text-3)",
        display: "flex",
        alignItems: "center",
        flexShrink: 0,
        transition: "color 0.16s",
      }}>
        {icon}
      </span>
      {label}
    </Link>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function Sidebar() {
  return (
    <Suspense>
      <SidebarInner />
    </Suspense>
  )
}

function SidebarInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [theme, setTheme] = useState<"dark" | "light">("light")
  const [spacesOpen, setSpacesOpen] = useState(true)
  const [hoveredSpaceId, setHoveredSpaceId] = useState<string | null>(null)
  const [deletingSpaceId, setDeletingSpaceId] = useState<string | null>(null)
  const { isOpen: aiPanelOpen, toggle: toggleAiPanel } = useAiPanel()

  const activeSpaceId = searchParams.get("space")

  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null
    const initial = saved ?? "light"
    setTheme(initial)
    if (initial === "dark") {
      document.documentElement.setAttribute("data-theme", "dark")
    } else {
      document.documentElement.removeAttribute("data-theme")
    }
  }, [])

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    localStorage.setItem("theme", next)
    if (next === "dark") {
      document.documentElement.setAttribute("data-theme", "dark")
    } else {
      document.documentElement.removeAttribute("data-theme")
    }
  }

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getUser().then(({ data }) => { setUser(data.user) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const { data: spaces = [], mutate: mutateSpaces } = useSWR<Space[]>(
    user ? "/api/spaces" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  async function handleDeleteSpace(e: React.MouseEvent, spaceId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (deletingSpaceId) return
    setDeletingSpaceId(spaceId)
    // Optimistic remove
    mutateSpaces(spaces.filter((s) => s.id !== spaceId), false)
    try {
      await fetch(`/api/spaces/${spaceId}`, { method: "DELETE" })
      mutateSpaces()
      // If we're currently viewing the deleted space, go back to /notes
      if (activeSpaceId === spaceId) router.push("/notes")
    } catch {
      mutateSpaces() // revalidate on error
    } finally {
      setDeletingSpaceId(null)
    }
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowser()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? "?"

  return (
    <aside style={{
      position: "fixed",
      top: 0,
      left: 0,
      bottom: 0,
      width: "var(--sidebar-w)",
      background: "var(--bg-sidebar)",
      borderRight: "1px solid var(--border)",
      display: "flex",
      flexDirection: "column",
      zIndex: 50,
      overflow: "hidden",
    }}>

      {/* Brand row */}
      <div style={{
        padding: "20px 16px 16px",
        flexShrink: 0,
      }}>
        <Link
          href={user ? "/dashboard" : "/"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            textDecoration: "none",
            marginBottom: "14px",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: "var(--accent)" }}>
            <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          </svg>
          <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-1)", letterSpacing: "-0.015em" }}>
            Brain
          </span>
        </Link>

        {/* Quick-create buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <button
            onClick={() => router.push("/notes?compose=1")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 12px",
              borderRadius: "8px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              width: "100%",
              transition: "opacity 0.18s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.88" }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1" }}
          >
            <span style={{ fontSize: "15px", fontWeight: 300, lineHeight: 1, marginTop: "-1px" }}>+</span>
            New Note
            <kbd style={{
              marginLeft: "auto",
              fontSize: "10px",
              opacity: 0.7,
              fontWeight: 400,
              fontFamily: "inherit",
              background: "rgba(255,255,255,0.2)",
              padding: "1px 4px",
              borderRadius: "3px",
            }}>N</kbd>
          </button>

          <button
            onClick={() => router.push("/tasks?create=1")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "7px 12px",
              borderRadius: "8px",
              background: "transparent",
              color: "var(--text-2)",
              border: "1px solid var(--border)",
              cursor: "pointer",
              fontSize: "13px",
              width: "100%",
              transition: "border-color 0.18s, color 0.18s, background 0.18s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--border-hover)"
              e.currentTarget.style.color = "var(--text-1)"
              e.currentTarget.style.background = "var(--bg-hover)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)"
              e.currentTarget.style.color = "var(--text-2)"
              e.currentTarget.style.background = "transparent"
            }}
          >
            <span style={{ fontSize: "15px", fontWeight: 300, lineHeight: 1, marginTop: "-1px" }}>+</span>
            New Task
            <kbd style={{
              marginLeft: "auto",
              fontSize: "10px",
              opacity: 0.5,
              fontWeight: 400,
              fontFamily: "inherit",
            }}>T</kbd>
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav style={{
        flex: 1,
        overflowY: "auto",
        padding: "4px 8px",
        display: "flex",
        flexDirection: "column",
        gap: "1px",
      }}>

        {/* WORKSPACE section */}
        <SectionHeader label="Workspace" />
        <NavLink href="/dashboard" label="Home" icon={<HomeIcon />} isActive={pathname === "/dashboard"} />
        <NavLink href="/notes" label="Notes" icon={<NotesIcon />} isActive={pathname === "/notes" || pathname.startsWith("/notes/")} />
        <NavLink href="/tasks" label="Tasks" icon={<TasksIcon />} isActive={pathname === "/tasks"} />

        {/* KNOWLEDGE section */}
        <div style={{ marginTop: "8px" }}>
          <SectionHeader label="Knowledge" />
          <NavLink href="/graph" label="Graph" icon={<GraphIcon />} isActive={pathname === "/graph"} />
        </div>

        {/* SPACES section */}
        {spaces.length > 0 && (
          <div style={{ marginTop: "8px" }}>
            <button
              onClick={() => setSpacesOpen((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 14px 3px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-3)",
                transition: "color 0.16s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-2)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
            >
              <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Spaces
              </span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: spacesOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.16s ease-in-out" }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {spacesOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                {spaces.map((space) => {
                  const isActiveSpace = pathname === "/notes" && activeSpaceId === space.id
                  const isHovered = hoveredSpaceId === space.id
                  return (
                    <div
                      key={space.id}
                      style={{ position: "relative" }}
                      onMouseEnter={() => setHoveredSpaceId(space.id)}
                      onMouseLeave={() => setHoveredSpaceId(null)}
                    >
                      <Link
                        href={`/notes?space=${space.id}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "8px 32px 8px 14px",
                          borderRadius: "8px",
                          fontSize: "14px",
                          fontWeight: isActiveSpace ? 500 : 400,
                          color: isActiveSpace ? "var(--text-1)" : "var(--text-2)",
                          textDecoration: "none",
                          background: isActiveSpace ? "var(--accent-dim)" : isHovered ? "var(--bg-hover)" : "transparent",
                          transition: "color 0.16s, background 0.16s",
                        }}
                      >
                        <span style={{ fontSize: "11px", color: isActiveSpace ? "var(--accent)" : "var(--text-3)", fontWeight: 600, flexShrink: 0, transition: "color 0.16s" }}>@</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{space.name}</span>
                      </Link>
                      {/* Delete button — shown on hover */}
                      {isHovered && (
                        <button
                          onClick={(e) => handleDeleteSpace(e, space.id)}
                          title="Delete space"
                          style={{
                            position: "absolute",
                            right: "8px",
                            top: "50%",
                            transform: "translateY(-50%)",
                            width: "18px",
                            height: "18px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "transparent",
                            border: "none",
                            borderRadius: "4px",
                            cursor: "pointer",
                            color: "var(--text-3)",
                            fontSize: "14px",
                            lineHeight: 1,
                            transition: "color 0.15s, background 0.15s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "#FF453A"
                            e.currentTarget.style.background = "rgba(255,69,58,0.1)"
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--text-3)"
                            e.currentTarget.style.background = "transparent"
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* AI Assistant toggle */}
        <button
          onClick={toggleAiPanel}
          className="nav-link"
          data-active={aiPanelOpen ? "true" : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            padding: "8px 14px",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: aiPanelOpen ? 500 : 400,
            color: aiPanelOpen ? "var(--ai-accent)" : "var(--text-2)",
            background: aiPanelOpen ? "var(--ai-accent-dim)" : "transparent",
            border: "none",
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
            transition: "color 0.16s ease-in-out, background 0.16s ease-in-out",
          }}
        >
          <span style={{ color: aiPanelOpen ? "var(--ai-accent)" : "var(--text-3)", display: "flex", alignItems: "center", flexShrink: 0, transition: "color 0.16s" }}>
            <SparkleIcon />
          </span>
          AI Assistant
          {aiPanelOpen && (
            <span style={{ marginLeft: "auto", width: "6px", height: "6px", borderRadius: "50%", background: "var(--ai-accent)", flexShrink: 0 }} />
          )}
        </button>

        {/* Settings */}
        <NavLink href="/settings" label="Settings" icon={<SettingsIcon />} isActive={pathname === "/settings"} />
      </nav>

      {/* Footer: avatar + email + theme + sign out */}
      <div style={{
        padding: "12px 14px",
        borderTop: "1px solid var(--border)",
        flexShrink: 0,
      }}>
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: "26px",
              height: "26px",
              borderRadius: "50%",
              background: "var(--accent-dim)",
              border: "1px solid var(--border-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--accent)",
              flexShrink: 0,
            }}>
              {avatarLetter}
            </div>

            <p style={{ flex: 1, fontSize: "11px", color: "var(--text-2)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user.email}
            </p>

            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center", padding: "3px", borderRadius: "5px", flexShrink: 0, transition: "color 0.16s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>

            <button
              onClick={handleSignOut}
              title="Sign out"
              style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-3)", display: "flex", alignItems: "center", padding: "3px", borderRadius: "5px", flexShrink: 0, transition: "color 0.16s" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-1)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
            >
              <LogOutIcon />
            </button>
          </div>
        ) : (
          <Link href="/login" style={{ display: "block", fontSize: "14px", color: "var(--text-2)", textDecoration: "none", padding: "8px 12px", border: "1px solid var(--border)", borderRadius: "8px", textAlign: "center", transition: "color 0.16s, border-color 0.16s" }}>
            Sign in
          </Link>
        )}
      </div>
    </aside>
  )
}
