-- Migration: Add entity summary fields
-- This migration adds summary caching to the entities table

ALTER TABLE entities 
ADD COLUMN IF NOT EXISTS summary TEXT,
ADD COLUMN IF NOT EXISTS summary_updated_at TIMESTAMP WITH TIME ZONE;

-- Create an index for efficient querying by summary_updated_at
CREATE INDEX IF NOT EXISTS idx_entities_summary_updated_at 
ON entities(user_id, summary_updated_at);
