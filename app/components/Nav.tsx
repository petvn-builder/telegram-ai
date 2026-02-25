"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { getSupabaseBrowser } from "@/lib/supabase/browser"
import type { User } from "@supabase/supabase-js"

const NAV_LINKS = [
  { href: "/graph", label: "Graph" },
  { href: "/notes", label: "Notes" },
  { href: "/settings", label: "Settings" },
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const supabase = getSupabaseBrowser()

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    const supabase = getSupabaseBrowser()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  // Hide nav on auth pages
  if (pathname === "/login" || pathname === "/signup") return null

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: "52px",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        background: "rgba(13, 13, 20, 0.85)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
      }}
    >
      {/* Logo */}
      <Link
        href={user ? "/dashboard" : "/"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          textDecoration: "none",
          marginRight: "32px",
          flexShrink: 0,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path
            d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z"
            stroke="#6366f1"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2.5" fill="#6366f1" />
        </svg>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "#e8e8f0", letterSpacing: "-0.01em" }}>
          Brain
        </span>
      </Link>

      {/* Nav links — only show when authenticated */}
      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href || pathname.startsWith(href + "/")
            return (
              <Link
                key={href}
                href={href}
                style={{
                  position: "relative",
                  padding: "6px 12px",
                  fontSize: "13px",
                  fontWeight: isActive ? 500 : 400,
                  color: isActive ? "#e8e8f0" : "#9090a8",
                  textDecoration: "none",
                  borderRadius: "6px",
                  background: isActive ? "rgba(99, 102, 241, 0.10)" : "transparent",
                  transition: "color 0.15s, background 0.15s",
                }}
              >
                {label}
                {isActive && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: "-1px",
                      left: "12px",
                      right: "12px",
                      height: "2px",
                      background: "#6366f1",
                      borderRadius: "999px",
                    }}
                  />
                )}
              </Link>
            )
          })}
        </div>
      )}

      {/* Auth section — flush right */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
        {user ? (
          <>
            <span style={{
              fontSize: "12px",
              color: "#9090a8",
              maxWidth: "180px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {user.email}
            </span>
            <button
              onClick={handleSignOut}
              style={{
                fontSize: "12px",
                color: "#9090a8",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "6px",
                padding: "4px 10px",
                cursor: "pointer",
                transition: "color 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#e8e8f0"
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.16)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#9090a8"
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <Link
            href="/login"
            style={{
              fontSize: "12px",
              color: "#9090a8",
              textDecoration: "none",
              padding: "4px 10px",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "6px",
              transition: "color 0.15s",
            }}
          >
            Sign in
          </Link>
        )}
      </div>
    </nav>
  )
}
