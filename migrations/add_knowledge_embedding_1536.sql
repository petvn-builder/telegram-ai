-- Migration: ensure match_knowledge RPC has a properly-sized vector(1536)
-- parameter. An earlier version of this function was created with an unsized
-- `vector` arg, which prevents the ivfflat index from being used and can
-- silently return zero rows depending on pgvector version.
--
-- Safe to re-run. Does NOT touch the knowledge.embedding column or data.

DROP FUNCTION IF EXISTS match_knowledge(vector, text, integer);
DROP FUNCTION IF EXISTS match_knowledge(vector(1536), text, integer);

CREATE OR REPLACE FUNCTION match_knowledge(
  query_embedding vector(1536),
  match_user      TEXT,
  match_count     INT DEFAULT 8
)
RETURNS TABLE (
  id         UUID,
  content    TEXT,
  role       TEXT,
  similarity FLOAT,
  created_at TIMESTAMPTZ
)
LANGUAGE SQL STABLE AS $$
  SELECT
    k.id,
    k.content,
    k.role,
    1 - (k.embedding <=> query_embedding) AS similarity,
    k.created_at
  FROM knowledge k
  WHERE k.user_id = match_user
    AND k.embedding IS NOT NULL
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
$$;
