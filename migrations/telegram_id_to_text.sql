-- Allow storing non-numeric identifiers (e.g. "web:<uuid>") for web-only rate limiting
ALTER TABLE users ALTER COLUMN telegram_id TYPE text USING telegram_id::text;
