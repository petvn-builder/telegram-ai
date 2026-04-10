import { getSupabaseAdmin } from "@/lib/supabase/admin"

const MAX_MESSAGES_PER_GROUP = 30

/**
 * Persist an incoming group message and prune to keep only the latest
 * MAX_MESSAGES_PER_GROUP rows per chat (delete-on-insert — no cron needed).
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

  // Fire-and-forget: keep only the latest MAX_MESSAGES_PER_GROUP rows per chat
  ;(async () => {
    const { data: rows } = await db
      .from("group_messages")
      .select("id, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(MAX_MESSAGES_PER_GROUP + 1)

    if (rows && rows.length === MAX_MESSAGES_PER_GROUP + 1) {
      const cutoff = rows[MAX_MESSAGES_PER_GROUP].created_at
      await db.from("group_messages")
        .delete()
        .eq("chat_id", chatId)
        .lte("created_at", cutoff)
    }
  })().catch((err: unknown) => console.error("[group-chat] cleanup error", err))
}

/**
 * Fetch the recent conversation context for a chat.
 * Returns up to `limit` messages from the last `windowMinutes` minutes,
 * whichever window covers more messages, sorted oldest → newest.
 */
export async function getRecentMessages(
  chatId: string,
  limit = 30
): Promise<Array<{ displayName: string; text: string }>> {
  const db = getSupabaseAdmin()

  const { data: rows } = await db
    .from("group_messages")
    .select("username, first_name, last_name, text, created_at")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: false })
    .limit(limit)

  const sorted = (rows ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at))

  return sorted.map(({ first_name, last_name, username, text }) => {
    const displayName = [first_name, last_name].filter(Boolean).join(" ") || username || "User"
    return { displayName, text }
  })
}
