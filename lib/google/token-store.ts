import { createCipheriv, createDecipheriv, randomBytes } from "crypto"
import { getSupabaseAdmin } from "@/lib/supabase/admin"

export interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiry: Date
  scopes: string[]
  googleEmail?: string
}

// ── Encryption (AES-256-GCM) ─────────────────────────────────────────────────

function getKey(): Buffer {
  const hex = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY
  if (!hex) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is not set")
  const key = Buffer.from(hex, "hex")
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be 32 bytes hex-encoded (64 hex chars)")
  }
  return key
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv)
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // Layout: iv(12) | tag(16) | ciphertext
  return Buffer.concat([iv, tag, ct]).toString("base64")
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ct = buf.subarray(28)
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(ct), decipher.final()])
  return plain.toString("utf8")
}

// ── Supabase row I/O ─────────────────────────────────────────────────────────

interface DbRow {
  user_id: string
  google_email: string | null
  access_token: string
  refresh_token: string
  scopes: string[]
  expiry: string
}

export async function loadTokens(userId: string): Promise<StoredTokens | null> {
  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from("user_google_credentials")
    .select("user_id, google_email, access_token, refresh_token, scopes, expiry")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) throw new Error(`loadTokens failed: ${error.message}`)
  if (!data) return null
  const row = data as DbRow

  return {
    accessToken: decrypt(row.access_token),
    refreshToken: decrypt(row.refresh_token),
    expiry: new Date(row.expiry),
    scopes: row.scopes ?? [],
    googleEmail: row.google_email ?? undefined,
  }
}

/**
 * Upsert tokens. If `partial.refreshToken` is omitted (e.g. on refresh Google
 * returns no new refresh_token), the existing refresh_token is preserved.
 */
export async function saveTokens(
  userId: string,
  partial: Partial<StoredTokens> & Pick<StoredTokens, "accessToken" | "expiry">
): Promise<void> {
  const db = getSupabaseAdmin()

  let refreshToken = partial.refreshToken
  let scopes = partial.scopes
  let googleEmail = partial.googleEmail

  if (!refreshToken || !scopes || googleEmail === undefined) {
    const existing = await loadTokens(userId)
    refreshToken = refreshToken ?? existing?.refreshToken
    scopes = scopes ?? existing?.scopes ?? []
    googleEmail = googleEmail ?? existing?.googleEmail ?? null as unknown as string
  }

  if (!refreshToken) {
    throw new Error("saveTokens: refreshToken required on first save")
  }

  const { error } = await db.from("user_google_credentials").upsert(
    {
      user_id: userId,
      google_email: googleEmail ?? null,
      access_token: encrypt(partial.accessToken),
      refresh_token: encrypt(refreshToken),
      scopes,
      expiry: partial.expiry.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  )
  if (error) throw new Error(`saveTokens failed: ${error.message}`)
}

export async function deleteTokens(userId: string): Promise<void> {
  const db = getSupabaseAdmin()
  const { error } = await db.from("user_google_credentials").delete().eq("user_id", userId)
  if (error) throw new Error(`deleteTokens failed: ${error.message}`)
}
