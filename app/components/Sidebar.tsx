"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import useSWR from "swr"
import { getSupabaseBrowser } from "@/lib/supabase/browser"
import type { User } from "@supabase/supabase-js"
import type { Space } from "@/app/notes/types"
import { fetcher } from "@/lib/fetcher"

const PRIMARY_LINKS = [
  {
    href: "/notes",
    label: "Notes",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: "/tasks",
    label: "Tasks",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    href: "/graph",
    label: "Graph",
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="2" />
        <circle cx="5" cy="19" r="2" />
        <circle cx="19" cy="19" r="2" />
        <line x1="12" y1="7" x2="5" y2="17" />
        <line x1="12" y1="7" x2="19" y2="17" />
        <line x1="5" y1="17" x2="19" y2="17" />
      </svg>
    ),
  },
]

const SETTINGS_LINK = {
  href: "/settings",
  label: "Settings",
  icon: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
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
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
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
        gap: "10px",
        padding: "9px 14px",
        borderRadius: "8px",
        fontSize: "15px",
        fontWeight: isActive ? 500 : 400,
        color: isActive ? "var(--text-1)" : "var(--text-2)",
        textDecoration: "none",
        background: isActive ? "var(--accent-dim)" : "transparent",
        borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "color 0.16s ease-in-out, background 0.16s ease-in-out",
      }}
    >
      <span
        style={{
          color: isActive ? "var(--accent)" : "var(--text-3)",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          transition: "color 0.16s",
        }}
      >
        {icon}
      </span>
      {label}
    </Link>
  )
}

function Divider() {
  return (
    <div
      style={{
        height: "1px",
        background: "var(--border)",
        margin: "8px 10px",
      }}
    />
  )
}

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

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const { data: spaces = [] } = useSWR<Space[]>(
    user ? "/api/spaces" : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  )

  async function handleSignOut() {
    const supabase = getSupabaseBrowser()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? "?"

  return (
    <aside
      style={{
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
      }}
    >
      {/* Brand row */}
      <div
        style={{
          padding: "22px 16px 18px",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
        }}
      >
        <Link
          href={user ? "/notes" : "/"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "9px",
            textDecoration: "none",
            flex: 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: "var(--accent)" }}>
            <path
              d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="2.5" fill="currentColor" />
          </svg>
          <span
            style={{
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--text-1)",
              letterSpacing: "-0.015em",
            }}
          >
            Brain
          </span>
        </Link>

        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-3)",
            display: "flex",
            alignItems: "center",
            padding: "4px",
            borderRadius: "6px",
            flexShrink: 0,
            transition: "color 0.16s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-2)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      {/* Nav */}
      <nav
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 8px",
          display: "flex",
          flexDirection: "column",
          gap: "3px",
        }}
      >
        {/* Primary links: Notes, Graph */}
        {PRIMARY_LINKS.map(({ href, label, icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/")
          return (
            <NavLink key={href} href={href} label={label} icon={icon} isActive={isActive} />
          )
        })}

        {/* Spaces section */}
        {spaces.length > 0 && (
          <>
            <div style={{ margin: "6px 0" }}>
              <Divider />
            </div>

            <button
              onClick={() => setSpacesOpen((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 14px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-3)",
                borderRadius: "6px",
                transition: "color 0.16s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-2)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
            >
              <span style={{ fontSize: "13px", fontWeight: 400 }}>
                Spaces
              </span>
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: spacesOpen ? "rotate(0deg)" : "rotate(-90deg)",
                  transition: "transform 0.16s ease-in-out",
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {spacesOpen && (
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {spaces.map((space) => {
                  const isActiveSpace = pathname === "/notes" && activeSpaceId === space.id
                  return (
                    <Link
                      key={space.id}
                      href={`/notes?space=${space.id}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 14px",
                        borderRadius: "8px",
                        fontSize: "14px",
                        fontWeight: isActiveSpace ? 500 : 400,
                        color: isActiveSpace ? "var(--text-1)" : "var(--text-2)",
                        textDecoration: "none",
                        background: isActiveSpace ? "var(--accent-dim)" : "transparent",
                        borderLeft: isActiveSpace ? "2px solid var(--accent)" : "2px solid transparent",
                        transition: "color 0.16s, background 0.16s",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActiveSpace) {
                          ;(e.currentTarget as HTMLElement).style.color = "var(--text-1)"
                          ;(e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActiveSpace) {
                          ;(e.currentTarget as HTMLElement).style.color = "var(--text-2)"
                          ;(e.currentTarget as HTMLElement).style.background = "transparent"
                        }
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          color: isActiveSpace ? "var(--accent)" : "var(--text-3)",
                          fontWeight: 500,
                          transition: "color 0.16s",
                          flexShrink: 0,
                        }}
                      >
                        @
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {space.name}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Divider before Settings */}
        <div style={{ margin: "6px 0" }}>
          <Divider />
        </div>

        {/* Settings */}
        <NavLink
          href={SETTINGS_LINK.href}
          label={SETTINGS_LINK.label}
          icon={SETTINGS_LINK.icon}
          isActive={pathname === SETTINGS_LINK.href}
        />
      </nav>

      {/* User section */}
      <div
        style={{
          padding: "14px 16px",
          borderTop: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {user ? (
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
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
              }}
            >
              {avatarLetter}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--text-2)",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {user.email}
              </p>
              <button
                onClick={handleSignOut}
                style={{
                  fontSize: "11px",
                  color: "var(--text-3)",
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  transition: "color 0.16s",
                  marginTop: "1px",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-2)" }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-3)" }}
              >
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <Link
            href="/login"
            style={{
              display: "block",
              fontSize: "14px",
              color: "var(--text-2)",
              textDecoration: "none",
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              textAlign: "center",
              transition: "color 0.16s, border-color 0.16s",
            }}
          >
            Sign in
          </Link>
        )}
      </div>
    </aside>
  )
}
