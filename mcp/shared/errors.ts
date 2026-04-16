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
  const msg =
    err?.response?.data?.error?.message ??
    err?.errors?.[0]?.message ??
    err?.message ??
    "Google API error"

  if (status === 401 || status === 403) {
    return new ToolError("auth_error", `${msg} (reconnect Google at /settings/integrations)`)
  }
  if (status === 404) return new ToolError("not_found", msg)
  if (status === 429) return new ToolError("rate_limited", msg)
  return new ToolError("google_error", msg)
}
