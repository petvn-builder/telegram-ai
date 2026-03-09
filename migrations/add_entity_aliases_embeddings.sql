-- Migration: add aliases and embedding to entities
-- Run in Supabase SQL editor

-- Add aliases column (array of alternate names/nicknames)
ALTER TABLE entities ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}';

-- Add embedding column for vector similarity search on entity identity
ALTER TABLE entities ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Index for fast cosine similarity search on entity embeddings
CREATE INDEX IF NOT EXISTS idx_entities_embedding
  ON entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RPC: find entities by vector similarity (used when alias matching fails)
CREATE OR REPLACE FUNCTION match_entities(
  query_embedding      vector(1536),
  match_user           TEXT,
  match_count          INT     DEFAULT 5,
  similarity_threshold FLOAT   DEFAULT 0.75
)
RETURNS TABLE (
  id         UUID,
  name       TEXT,
  type       TEXT,
  aliases    TEXT[],
  similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    e.id,
    e.name,
    e.type,
    e.aliases,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM entities e
  WHERE e.user_id = match_user
    AND e.embedding IS NOT NULL
    AND 1 - (e.embedding <=> query_embedding) > similarity_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
$$;
