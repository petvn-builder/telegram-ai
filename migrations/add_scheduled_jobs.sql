-- ============================================================
-- Migration: Telegram scheduled auto-send jobs
-- Run this in the Supabase SQL editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.telegram_scheduled_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type     text NOT NULL DEFAULT 'todo',
  send_times   text[] NOT NULL DEFAULT '{}',   -- HH:MM strings e.g. ["07:00", "21:00"]
  repeat       text NOT NULL DEFAULT 'everyday', -- 'everyday' | 'weekdays' | 'weekends'
  timezone     text NOT NULL DEFAULT 'UTC',
  enabled      boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, job_type)
);

CREATE INDEX IF NOT EXISTS idx_tsj_enabled
  ON public.telegram_scheduled_jobs(enabled)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_tsj_user
  ON public.telegram_scheduled_jobs(user_id);

-- Enable Row Level Security
ALTER TABLE public.telegram_scheduled_jobs ENABLE ROW LEVEL SECURITY;

-- Users can manage their own jobs
CREATE POLICY "user can manage own scheduled jobs"
  ON public.telegram_scheduled_jobs
  FOR ALL
  USING (auth.uid() = user_id);

-- Note: service-role (admin) client bypasses RLS for cron use.
