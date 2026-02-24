-- Migration: Add entity summary fields
-- This migration adds summary caching to the entities table

ALTER TABLE entities 
ADD COLUMN IF NOT EXISTS summary TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMP DEFAULT NULL;

-- Create an index for efficient querying by summary_updated_at
CREATE INDEX IF NOT EXISTS idx_entities_summary_updated_at 
ON entities(user_id, summary_updated_at);
