import { askOpenAI } from "@/lib/openai"
import type { SupabaseClient } from "@supabase/supabase-js"

export interface TemporalNote {
  id: string
  content: string
  created_at: string
}

const CHUNK_SIZE = 20
const CHAR_LIMIT = 4000

export async function fetchNotesByTimeRange(
  supabase: SupabaseClient,
  userId: string,
  start: Date,
  end: Date,
  limit = 50
): Promise<TemporalNote[]> {
  const { data, error } = await supabase
    .from("knowledge")
    .select("id, content, created_at")
    .eq("user_id", userId)
    .eq("role", "note")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data as TemporalNote[]) ?? []
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

export async function fetchNotesByTimeRangeAndSemantics(
  supabase: SupabaseClient,
  userId: string,
  start: Date,
  end: Date,
  queryEmbedding: number[],
  limit = 50
): Promise<TemporalNote[]> {
  const { data, error } = await supabase
    .from("knowledge")
    .select("id, content, created_at, embedding")
    .eq("user_id", userId)
    .eq("role", "note")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit * 3) // fetch more, then re-rank

  if (error) throw error
  if (!data || data.length === 0) return []

  type RawNote = TemporalNote & { embedding: number[] | null }

  const scored = (data as RawNote[])
    .map((note) => ({
      id: note.id,
      content: note.content,
      created_at: note.created_at,
      score: note.embedding ? dotProduct(queryEmbedding, note.embedding) : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored.map(({ id, content, created_at }) => ({ id, content, created_at }))
}

export async function summarizeNotes(
  notes: TemporalNote[],
  rangeLabel: string
): Promise<string> {
  const totalChars = notes.reduce((sum, n) => sum + n.content.length, 0)

  if (notes.length <= 50 && totalChars <= CHAR_LIMIT) {
    const body = notes.map((n) => n.content).join("\n---\n")
    const prompt = `Summarize the following notes saved ${rangeLabel}. Group by theme where possible. Be concise.\n\nNotes:\n${body}`
    return await askOpenAI("", prompt)
  }

  // Hierarchical: chunk → summarize each → meta-summarize
  const chunks: TemporalNote[][] = []
  for (let i = 0; i < notes.length; i += CHUNK_SIZE) {
    chunks.push(notes.slice(i, i + CHUNK_SIZE))
  }

  const chunkSummaries = await Promise.all(
    chunks.map(async (chunk) => {
      const body = chunk.map((n) => n.content).join("\n---\n")
      const prompt = `Briefly summarize this batch of personal notes:\n\n${body}`
      return await askOpenAI("", prompt)
    })
  )

  const combined = chunkSummaries.join("\n\n")
  const metaPrompt = `Combine these note summaries into one coherent summary. Group by theme. The notes were saved ${rangeLabel}.\n\n${combined}`
  return await askOpenAI("", metaPrompt)
}
