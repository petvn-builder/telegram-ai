import { google } from "googleapis"
import { CodeChallengeMethod, type OAuth2Client } from "google-auth-library"
import { loadTokens, saveTokens } from "./token-store"

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/tasks",
  "openid",
  "email",
]

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set`)
  return v
}

export function buildOAuthClient(): OAuth2Client {
  return new google.auth.OAuth2(
    env("GOOGLE_CLIENT_ID"),
    env("GOOGLE_CLIENT_SECRET"),
    env("GOOGLE_REDIRECT_URI")
  )
}

export interface AuthUrlOpts {
  state: string
  codeChallenge: string
  loginHint?: string
}

export function authUrl({ state, codeChallenge, loginHint }: AuthUrlOpts): string {
  const client = buildOAuthClient()
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    login_hint: loginHint,
    include_granted_scopes: true,
  })
}

export interface ExchangeResult {
  accessToken: string
  refreshToken: string
  expiry: Date
  scopes: string[]
  googleEmail?: string
}

export async function exchangeCode(code: string, codeVerifier: string): Promise<ExchangeResult> {
  const client = buildOAuthClient()
  const { tokens } = await client.getToken({ code, codeVerifier })
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Google did not return access_token + refresh_token. Ensure prompt=consent and access_type=offline.")
  }

  client.setCredentials(tokens)
  let googleEmail: string | undefined
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: client })
    const info = await oauth2.userinfo.get()
    googleEmail = info.data.email ?? undefined
  } catch {
    // Non-fatal
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiry: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
    scopes: (tokens.scope ?? GOOGLE_SCOPES.join(" ")).split(/\s+/).filter(Boolean),
    googleEmail,
  }
}

/**
 * Returns an OAuth2 client authenticated for `userId`. Automatically persists
 * refreshed tokens to the token store via the "tokens" event.
 *
 * Throws if the user has not connected Google.
 */
export async function getAuthedClientForUser(userId: string): Promise<OAuth2Client> {
  const stored = await loadTokens(userId)
  if (!stored) {
    console.error("[google/oauth] no tokens found for user:", userId)
    throw new Error("Google account not connected. Ask the user to connect it at /settings/integrations.")
  }

  const isExpired = stored.expiry.getTime() < Date.now()
  console.log("[google/oauth] loaded tokens for user:", userId, {
    googleEmail: stored.googleEmail,
    expiry: stored.expiry.toISOString(),
    isExpired,
    hasRefreshToken: !!stored.refreshToken,
    scopes: stored.scopes,
  })

  const client = buildOAuthClient()
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: stored.expiry.getTime(),
    scope: stored.scopes.join(" "),
    token_type: "Bearer",
  })

  client.on("tokens", (t) => {
    // On refresh, Google returns a new access_token (and expiry_date); refresh_token
    // is usually absent — saveTokens preserves the existing one in that case.
    if (!t.access_token) return
    console.log("[google/oauth] token refreshed for user:", userId)
    saveTokens(userId, {
      accessToken: t.access_token,
      expiry: new Date(t.expiry_date ?? Date.now() + 3600_000),
      refreshToken: t.refresh_token ?? undefined,
      scopes: stored.scopes,
      googleEmail: stored.googleEmail,
    }).catch((err) => console.error("[google/oauth] failed to persist refreshed tokens:", err))
  })

  return client
}
