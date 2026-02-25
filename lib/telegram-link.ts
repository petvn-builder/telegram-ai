import { createHash, randomBytes } from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any

export async function generateLinkToken(userId: string): Promise<string> {
  const admin: AdminClient = getSupabaseAdmin()

  await admin.from("telegram_link_tokens").delete().eq("user_id", userId)

  const rawToken = randomBytes(32).toString("hex")
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

  const { error: identityError } = await admin.from("user_identities").upsert(
    {
      user_id: row.user_id,
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername,
    },
    { onConflict: "telegram_user_id" }
  )

  if (identityError) {
    throw new Error(`Failed to create identity link: ${identityError.message}`)
  }

  await admin.from("telegram_link_tokens").delete().eq("id", row.id)
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
