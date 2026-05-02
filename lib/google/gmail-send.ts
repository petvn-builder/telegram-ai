import { gmailFor } from "./gmail-client"

export type CreateReplyDraftArgs = {
  userId: string
  threadId: string
  body: string
  subject?: string
  to?: string
  cc?: string[]
}

export type CreateReplyDraftResult = {
  draftId: string
  messageId: string
  threadId: string
}

function header(name: string, headers: { name?: string | null; value?: string | null }[] | undefined): string | null {
  if (!headers) return null
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase())
  return h?.value ?? null
}

function ensureRePrefix(subject: string): string {
  return /^re:\s/i.test(subject) ? subject : `Re: ${subject}`
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value
  const b64 = Buffer.from(value, "utf-8").toString("base64")
  return `=?UTF-8?B?${b64}?=`
}

// Quoted-printable encode each line; preserves blank-line spacing and handles
// non-ASCII safely. RFC 2045 §6.7: line length max 76, soft-break with `=`,
// encode `=` itself and any non-ASCII byte as `=XX`.
function quotedPrintableLine(line: string): string {
  const buf = Buffer.from(line, "utf-8")
  let out = ""
  let col = 0
  const flush = (token: string) => {
    if (col + token.length > 75) {
      out += "=\r\n"
      col = 0
    }
    out += token
    col += token.length
  }
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i]
    const isPrintable = b >= 0x20 && b <= 0x7e && b !== 0x3d // not '='
    flush(isPrintable ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, "0")}`)
  }
  return out
}

function quotedPrintable(body: string): string {
  // Normalize to LF first, then re-emit with CRLF between lines.
  const lines = body.replace(/\r\n/g, "\n").split("\n")
  return lines.map(quotedPrintableLine).join("\r\n")
}

function buildRfc2822(args: {
  to: string
  from?: string
  subject: string
  body: string
  inReplyTo?: string
  references?: string
  cc?: string[]
}): string {
  const headers: string[] = []
  headers.push(`To: ${args.to}`)
  if (args.cc && args.cc.length > 0) headers.push(`Cc: ${args.cc.join(", ")}`)
  headers.push(`Subject: ${encodeHeader(args.subject)}`)
  if (args.inReplyTo) headers.push(`In-Reply-To: ${args.inReplyTo}`)
  if (args.references) headers.push(`References: ${args.references}`)
  headers.push("MIME-Version: 1.0")
  headers.push('Content-Type: text/plain; charset="UTF-8"')
  headers.push("Content-Transfer-Encoding: quoted-printable")
  return headers.join("\r\n") + "\r\n\r\n" + quotedPrintable(args.body)
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

export async function createReplyDraft(args: CreateReplyDraftArgs): Promise<CreateReplyDraftResult> {
  const gmail = await gmailFor(args.userId)

  // Fetch the latest message in the thread to grab Message-Id + headers for threading.
  const thread = await gmail.users.threads.get({
    userId: "me",
    id: args.threadId,
    format: "metadata",
    metadataHeaders: ["Message-ID", "Message-Id", "Subject", "From", "To", "References"],
  })
  const messages = thread.data.messages ?? []
  if (messages.length === 0) throw new Error("Thread has no messages")
  const last = messages[messages.length - 1]
  const headers = last.payload?.headers ?? undefined

  const messageId = header("Message-Id", headers) ?? header("Message-ID", headers)
  const refs = header("References", headers)
  const lastSubject = header("Subject", headers) ?? args.subject ?? ""
  const lastFrom = header("From", headers) ?? ""

  const subject = ensureRePrefix(args.subject ?? lastSubject)
  const to = args.to ?? lastFrom
  if (!to) throw new Error("No recipient could be resolved for the reply")

  const references = [refs, messageId].filter(Boolean).join(" ").trim() || undefined

  const raw = buildRfc2822({
    to,
    subject,
    body: args.body,
    inReplyTo: messageId ?? undefined,
    references,
    cc: args.cc,
  })

  const draft = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw: base64UrlEncode(raw),
        threadId: args.threadId,
      },
    },
  })

  return {
    draftId: draft.data.id ?? "",
    messageId: draft.data.message?.id ?? "",
    threadId: draft.data.message?.threadId ?? args.threadId,
  }
}
