-- ─────────────────────────────────────────────────────────────────────────────
-- Entity cascade cleanup
-- Auto-deletes an entity when its last knowledge_link is removed.
-- ─────────────────────────────────────────────────────────────────────────────

-- Trigger function: called after each knowledge_links row deletion.
-- Deletes the entity if no other links point to it.
CREATE OR REPLACE FUNCTION cleanup_orphaned_entity()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM entities
  WHERE id = OLD.entity_id
    AND NOT EXISTS (
      SELECT 1 FROM knowledge_links WHERE entity_id = OLD.entity_id
    );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to knowledge_links
CREATE OR REPLACE TRIGGER trg_cleanup_orphaned_entity
  AFTER DELETE ON knowledge_links
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_orphaned_entity();

-- ─────────────────────────────────────────────────────────────────────────────
-- One-time cleanup: remove any entities that already have zero links
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM entities
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_links WHERE entity_id = entities.id
);
