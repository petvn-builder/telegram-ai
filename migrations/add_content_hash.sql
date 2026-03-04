-- Add content_hash to knowledge table for extraction deduplication.
-- Stores SHA-256 of the note content at the time of last entity extraction.
-- The server skips OpenAI extraction when the incoming content hash matches this value.

ALTER TABLE knowledge ADD COLUMN IF NOT EXISTS content_hash TEXT;
