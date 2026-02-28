-- Performance indexes for scale
-- Run in Supabase SQL editor

-- Notes list (most common query: user notes ordered by date)
CREATE INDEX IF NOT EXISTS idx_knowledge_user_created
  ON knowledge(user_id, created_at DESC);

-- Role filter (notes vs AI messages vs user messages)
CREATE INDEX IF NOT EXISTS idx_knowledge_user_role
  ON knowledge(user_id, role);

-- Links lookup: fetching all links for a set of notes
CREATE INDEX IF NOT EXISTS idx_knowledge_links_knowledge_id
  ON knowledge_links(knowledge_id);

-- Links lookup: fetching all notes that mention an entity
CREATE INDEX IF NOT EXISTS idx_knowledge_links_entity_id
  ON knowledge_links(entity_id);

-- Links lookup: user-scoped graph query
CREATE INDEX IF NOT EXISTS idx_knowledge_links_user_id
  ON knowledge_links(user_id);

-- Entity name lookup (upsert on every note save does eq(user_id).eq(name))
CREATE INDEX IF NOT EXISTS idx_entities_user_name
  ON entities(user_id, lower(name));

-- Entity summary refresh job (find stale/missing summaries)
-- idx_entities_summary_updated_at should already exist from add_entity_summary.sql
-- but add if missing:
CREATE INDEX IF NOT EXISTS idx_entities_user_summary_updated
  ON entities(user_id, summary_updated_at NULLS FIRST);

-- ──────────────────────────────────────────────────────────────────
-- RLS optimization: evaluate auth.uid() once per query, not per row
-- (re-create policies using subquery form)
-- ──────────────────────────────────────────────────────────────────

-- knowledge table
DROP POLICY IF EXISTS "Users can view their own knowledge" ON knowledge;
CREATE POLICY "Users can view their own knowledge" ON knowledge
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own knowledge" ON knowledge;
CREATE POLICY "Users can insert their own knowledge" ON knowledge
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own knowledge" ON knowledge;
CREATE POLICY "Users can update their own knowledge" ON knowledge
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own knowledge" ON knowledge;
CREATE POLICY "Users can delete their own knowledge" ON knowledge
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- entities table
DROP POLICY IF EXISTS "Users can view their own entities" ON entities;
CREATE POLICY "Users can view their own entities" ON entities
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own entities" ON entities;
CREATE POLICY "Users can insert their own entities" ON entities
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own entities" ON entities;
CREATE POLICY "Users can update their own entities" ON entities
  FOR UPDATE USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own entities" ON entities;
CREATE POLICY "Users can delete their own entities" ON entities
  FOR DELETE USING (user_id = (SELECT auth.uid()));

-- knowledge_links table
DROP POLICY IF EXISTS "Users can view their own knowledge links" ON knowledge_links;
CREATE POLICY "Users can view their own knowledge links" ON knowledge_links
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can insert their own knowledge links" ON knowledge_links;
CREATE POLICY "Users can insert their own knowledge links" ON knowledge_links
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete their own knowledge links" ON knowledge_links;
CREATE POLICY "Users can delete their own knowledge links" ON knowledge_links
  FOR DELETE USING (user_id = (SELECT auth.uid()));
