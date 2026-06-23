-- Run once against your Neon database to create the schema

-- access_token / refresh_token are encrypted at rest (AES-256-GCM, see lib/crypto.ts).
-- Stored as "enc:v1:<iv>:<tag>:<ciphertext>"; legacy plaintext rows are still readable.
CREATE TABLE IF NOT EXISTS oauth_tokens (
  provider      TEXT        PRIMARY KEY,
  access_token  TEXT        NOT NULL,
  refresh_token TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Daily time-series: one row per JST calendar date
CREATE TABLE IF NOT EXISTS daily_data (
  date           DATE        PRIMARY KEY,   -- JST date e.g. 2026-06-20
  -- Google Fit: activity
  burn_kcal      INTEGER,                   -- total calories (BMR + active)
  steps          INTEGER,
  heart_rate_avg INTEGER,
  sleep_min      INTEGER,
  -- Google Fit: body composition
  weight_kg      NUMERIC(5,2),
  body_fat_pct   NUMERIC(5,2),
  -- FatSecret: intake
  intake_kcal    INTEGER,
  p_g            NUMERIC(6,1),              -- protein g
  f_g            NUMERIC(6,1),              -- fat g
  c_g            NUMERIC(6,1),              -- carbs g
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- LLM usage tracking for Groq quota self-management (FR-4.5 / NFR-7)
CREATE TABLE IF NOT EXISTS llm_usage (
  id            SERIAL      PRIMARY KEY,
  provider      TEXT        NOT NULL DEFAULT 'groq',
  used_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prompt_tokens INTEGER     NOT NULL DEFAULT 0,
  comp_tokens   INTEGER     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS llm_usage_date_idx ON llm_usage (DATE(used_at AT TIME ZONE 'Asia/Tokyo'));

-- AI advice history (FR-4.4). kind = 'manual' | 'weekly'. week_start is the JST
-- Sunday that anchors a weekly auto-run, so we run the weekly advice at most once
-- per week (the "skip if already done this week" catch-up check).
CREATE TABLE IF NOT EXISTS advice_log (
  id         SERIAL      PRIMARY KEY,
  kind       TEXT        NOT NULL DEFAULT 'manual',
  week_start DATE,                              -- set for kind = 'weekly'
  advice     TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one weekly run per week.
CREATE UNIQUE INDEX IF NOT EXISTS advice_log_weekly_uniq
  ON advice_log (week_start) WHERE kind = 'weekly';

-- User goal/preferences. Single-user app: one row pinned to id = 1.
CREATE TABLE IF NOT EXISTS user_settings (
  id          INTEGER     PRIMARY KEY DEFAULT 1,
  target_kg   NUMERIC(5,2) NOT NULL DEFAULT 72.0,
  target_days INTEGER     NOT NULL DEFAULT 86,   -- legacy, superseded by target_date
  target_date DATE,                              -- absolute goal date; days-left is derived from it
  llm         TEXT        NOT NULL DEFAULT 'groq',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_settings_singleton CHECK (id = 1)
);

-- Add target_date to pre-existing tables (idempotent).
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS target_date DATE;
