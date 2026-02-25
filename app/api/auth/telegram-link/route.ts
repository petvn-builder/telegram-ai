import { NextResponse } from "next/server"
import { getSupabaseServer } from "@/lib/supabase/server"
import { generateLinkToken } from "@/lib/telegram-link"

/**
 * POST /api/auth/telegram-link
 *
 * Generates a secure one-time Telegram deep link for the authenticated user.
 * The user clicks the returned deepLink to open Telegram, where the bot
 * receives the raw token via /start and calls consumeLinkToken() to complete linking.
 *
 * Requires: valid session cookie (user must be logged in)
 */
export async function POST() {
  const supabase = await getSupabaseServer()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME
  if (!botUsername) {
    console.error("TELEGRAM_BOT_USERNAME is not configured")
    return NextResponse.json(
      { error: "Bot not configured. Contact support." },
      { status: 500 }
    )
  }

  try {
    const rawToken = await generateLinkToken(user.id)
    const deepLink = `https://t.me/${botUsername}?start=link_${rawToken}`

    return NextResponse.json({ deepLink })
  } catch (err) {
    console.error("Telegram link token generation failed:", err)
    return NextResponse.json(
      { error: "Failed to generate link. Please try again." },
      { status: 500 }
    )
  }
}
