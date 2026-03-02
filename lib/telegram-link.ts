import { createHash, randomBytes } from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export async function generateLinkToken(userId: string): Promise<string> {
  const admin: AdminClient = getSupabaseAdmin()

  await admin.from("telegram_link_tokens").delete().eq("user_id", userId)

  const rawToken = randomBytes(29).toString("hex")
  const tokenHash = createHash("sha256").update(rawToken).digest("hex")
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

  const { error } = await admin.from("telegram_link_tokens").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
  })

  if (error) throw new Error(`Failed to store link token: ${error.message}`)

  return rawToken
}

export async function consumeLinkToken(
  rawToken: string,
  telegramUserId: string,
  telegramUsername: string
): Promise<void> {
  const admin: AdminClient = getSupabaseAdmin()
  const tokenHash = createHash("sha256").update(rawToken).digest("hex")

  const { data: row, error: findError } = await admin
    .from("telegram_link_tokens")
    .select("id, user_id, expires_at")
    .eq("token_hash", tokenHash)
    .single()

  if (findError || !row) {
    throw new Error("Invalid or already-used link token")
  }

  if (new Date(row.expires_at) < new Date()) {
    await admin.from("telegram_link_tokens").delete().eq("id", row.id)
    throw new Error("Link token has expired. Please generate a new one in Settings.")
  }

  // Upsert on user_id conflict — this replaces any previously linked Telegram account
  // for this web user (enforces 1 Telegram per web account).
  // We also delete any row that already holds this telegram_user_id to avoid
  // the unique(telegram_user_id) constraint when switching accounts.
  await admin
    .from("user_identities")
    .delete()
    .eq("telegram_user_id", telegramUserId)
    .neq("user_id", row.user_id)

  const { error: identityError } = await admin.from("user_identities").upsert(
    {
      user_id: row.user_id,
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername,
    },
    { onConflict: "user_id" }
  )

  if (identityError) {
    throw new Error(`Failed to create identity link: ${identityError.message}`)
  }

  await admin.from("telegram_link_tokens").delete().eq("id", row.id)
}

export async function unlinkTelegram(userId: string): Promise<void> {
  const admin: AdminClient = getSupabaseAdmin()

  const { error } = await admin
    .from("user_identities")
    .delete()
    .eq("user_id", userId)

  if (error) {
    throw new Error(`Failed to unlink Telegram: ${error.message}`)
  }
}

export async function getWebUserIdForTelegram(
  telegramUserId: string
): Promise<string | null> {
  const admin: AdminClient = getSupabaseAdmin()

  const { data } = await admin
    .from("user_identities")
    .select("user_id")
    .eq("telegram_user_id", telegramUserId)
    .single()

  return data?.user_id ?? null
}
