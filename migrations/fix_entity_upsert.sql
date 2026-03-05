-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: fix_entity_upsert
-- Run in Supabase SQL editor BEFORE deploying the updated routes.
-- All statements are safe to run on an empty or populated database.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Deduplicate case-variant entities ──────────────────────────────────────
-- For each (user_id, lower(name)) cluster, keep the oldest entity.
-- Re-point all knowledge_links from duplicates to the survivor, then delete dupes.

-- Re-point links from duplicate entity rows to the surviving (oldest) row
UPDATE knowledge_links kl
SET entity_id = survivors.id
FROM (
  SELECT DISTINCT ON (user_id, lower(name))
    id,
    user_id,
    lower(name) AS lname
  FROM entities
  ORDER BY user_id, lower(name), created_at ASC
) survivors
JOIN entities dupes
  ON dupes.user_id = survivors.user_id
  AND lower(dupes.name) = survivors.lname
  AND dupes.id != survivors.id
WHERE kl.entity_id = dupes.id;

-- Remove links that became duplicate after the re-point above
DELETE FROM knowledge_links kl
WHERE kl.ctid NOT IN (
  SELECT MIN(ctid)
  FROM knowledge_links
  GROUP BY knowledge_id, entity_id
);

-- Delete the duplicate entity rows (keep only the oldest per user+lower(name))
DELETE FROM entities
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id, lower(name)
        ORDER BY created_at ASC
      ) AS rn
    FROM entities
  ) ranked
  WHERE rn > 1
);

-- ── 2. Normalize existing entity names to lowercase ───────────────────────────
UPDATE entities
SET name = lower(name)
WHERE name != lower(name);

-- ── 3. Add UNIQUE constraint on entities(user_id, lower(name)) ───────────────
-- Enforces case-insensitive uniqueness at the DB level.
-- The existing functional index idx_entities_user_name can stay (used for lookups).
-- CORRECT — CREATE UNIQUE INDEX supports functional expressions:
CREATE UNIQUE INDEX IF NOT EXISTS uq_entities_user_lower_name
  ON entities(user_id, lower(name));


-- ── 4. Add UNIQUE index on knowledge_links(knowledge_id, entity_id) ───────────
-- Enables ignoreDuplicates upsert from the save routes.
-- No-op if an equivalent constraint already exists.
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_links_note_entity
  ON knowledge_links(knowledge_id, entity_id);

COMMIT;
