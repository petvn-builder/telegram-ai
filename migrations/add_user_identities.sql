-- ============================================================
-- Migration: Add Supabase Auth identity tables
-- Run this in the Supabase SQL editor
-- ============================================================

-- Table 1: Links auth.users UUIDs to telegram_user_id strings
CREATE TABLE IF NOT EXISTS public.user_identities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id  text UNIQUE NOT NULL,
  telegram_username text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ui_telegram
  ON public.user_identities(telegram_user_id);

CREATE INDEX IF NOT EXISTS idx_ui_user
  ON public.user_identities(user_id);

-- Table 2: Short-lived tokens for the Telegram account-linking flow
CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash  text UNIQUE NOT NULL,   -- SHA-256 of the raw token; raw token never stored
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tlt_hash
  ON public.telegram_link_tokens(token_hash);

-- Enable Row Level Security
ALTER TABLE public.user_identities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read their own linked identity
CREATE POLICY "user can read own identity"
  ON public.user_identities
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can manage their own link tokens
CREATE POLICY "user can manage own tokens"
  ON public.telegram_link_tokens
  FOR ALL
  USING (auth.uid() = user_id);

-- Note: the service-role client (admin) bypasses RLS automatically.
-- Bot operations use the admin client and do not need additional policies.
