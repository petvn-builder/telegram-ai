-- ============================================================
-- Migration: Enforce one Telegram account per web account
-- Run this in the Supabase SQL editor
-- ============================================================

-- First remove any duplicate user_id rows (keep the most recent one)
DELETE FROM public.user_identities a
USING public.user_identities b
WHERE a.user_id = b.user_id
  AND a.created_at < b.created_at;

-- Add unique constraint so each web account can only link one Telegram account
ALTER TABLE public.user_identities
  ADD CONSTRAINT user_identities_user_id_unique UNIQUE (user_id);
