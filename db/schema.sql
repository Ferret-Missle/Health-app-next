-- Run once against your Neon database to create the schema

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
