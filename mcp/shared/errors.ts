export class ToolError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = "ToolError"
  }
}

interface GaxiosErrorLike {
  code?: number | string
  message?: string
  errors?: Array<{ message?: string; reason?: string }>
  response?: { data?: { error?: { message?: string; code?: number; errors?: Array<{ message?: string; reason?: string }> } } }
}

export function wrapGoogleError(e: unknown): ToolError {
  const err = e as GaxiosErrorLike
  const statusRaw = err?.code ?? err?.response?.data?.error?.code
  const status = typeof statusRaw === "number" ? statusRaw : Number(statusRaw) || 0

  // Log the full error server-side for debugging, but never expose to callers
  const rawMsg = err?.response?.data?.error?.message ?? err?.message ?? "unknown"
  console.error("[google-api-error]", { status, message: rawMsg })

  if (status === 401 || status === 403) {
    return new ToolError("auth_error", "Authentication failed. Please reconnect Google at /settings/integrations.")
  }
  if (status === 404) return new ToolError("not_found", "The requested resource was not found.")
  if (status === 429) return new ToolError("rate_limited", "Rate limit exceeded. Please try again later.")
  return new ToolError("google_error", "A Google service error occurred. Please try again.")
}
