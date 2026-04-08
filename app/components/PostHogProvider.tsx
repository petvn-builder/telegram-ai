"use client"

import posthog from "posthog-js"
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, Suspense } from "react"
import { getSupabaseBrowser } from "@/lib/supabase/browser"

function PostHogPageview() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ph = usePostHog()

  useEffect(() => {
    if (!ph) return
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "")
    ph.capture("$pageview", { $current_url: url })
  }, [pathname, searchParams, ph])

  return null
}

function PostHogIdentify() {
  const ph = usePostHog()

  useEffect(() => {
    if (!ph) return
    const supabase = getSupabaseBrowser()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        ph.identify(data.user.id, { email: data.user.email })
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        ph.identify(session.user.id, { email: session.user.email })
      } else {
        ph.reset()
      }
    })
    return () => subscription.unsubscribe()
  }, [ph])

  return null
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return
    posthog.init(key, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: false,
      capture_pageleave: true,
    })
  }, [])

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageview />
        <PostHogIdentify />
      </Suspense>
      {children}
    </PHProvider>
  )
}
