import { getSupabaseAdmin } from "@/lib/supabase/admin"

const PURGE_WINDOW_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Persist an incoming group message and purge messages older than 30 min
 * for the same chat (delete-on-insert — no cron needed).
 */
export async function storeGroupMessage(
  chatId: string,
  telegramUserId: string,
  username: string,
  text: string,
  firstName?: string,
  lastName?: string
): Promise<void> {
  const db = getSupabaseAdmin()

  await db.from("group_messages").insert({
    chat_id: chatId,
    telegram_user_id: telegramUserId,
    username,
    first_name: firstName ?? null,
    last_name: lastName ?? null,
    text,
  })

  // Fire-and-forget cleanup — keeps the table small
  Promise.resolve(
    db.from("group_messages")
      .delete()
      .eq("chat_id", chatId)
      .lt("created_at", new Date(Date.now() - PURGE_WINDOW_MS).toISOString())
  ).catch((err: unknown) => console.error("[group-chat] cleanup error", err))
}

/**
 * Fetch the recent conversation context for a chat.
 * Returns up to `limit` messages from the last `windowMinutes` minutes,
 * whichever window covers more messages, sorted oldest → newest.
 */
export async function getRecentMessages(
  chatId: string,
  limit = 30,
  windowMinutes = 15
): Promise<Array<{ displayName: string; text: string }>> {
  const db = getSupabaseAdmin()

  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()
  const fields = "username, first_name, last_name, text, created_at"

  // Fetch last `limit` rows regardless of time
  const { data: byCount } = await db
    .from("group_messages")
    .select(fields)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(limit)

  const countRows = byCount ?? []

  // Also fetch rows within the time window (may overlap)
  const { data: byTime } = await db
    .from("group_messages")
    .select(fields)
    .eq("chat_id", chatId)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(limit)

  const timeRows = byTime ?? []

  // Union: keep whichever set is larger, dedup by (created_at + text)
  const source = timeRows.length >= countRows.length ? timeRows : countRows
  const seen = new Set<string>()
  const merged: Array<{ username: string; first_name: string | null; last_name: string | null; text: string; created_at: string }> = []

  for (const row of source) {
    const key = `${row.created_at}::${row.text}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(row)
    }
  }

  // Sort oldest → newest for natural reading order
  merged.sort((a, b) => a.created_at.localeCompare(b.created_at))

  return merged.map(({ first_name, last_name, username, text }) => {
    const displayName = [first_name, last_name].filter(Boolean).join(" ") || username || "User"
    return { displayName, text }
  })
}
