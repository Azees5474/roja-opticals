-- ══════════════════════════════════════════════════════════
-- ROJA OPTICALS — FOLLOW-UP DATABASE MIGRATION
-- Version: 2.0
-- Safe to run multiple times (all statements are idempotent)
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ══════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────
-- SECTION 1: EXTEND EXISTING customers TABLE
-- Only adds new columns. Does NOT touch existing columns.
-- ──────────────────────────────────────────────────────────

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS last_purchase_date  date,
  ADD COLUMN IF NOT EXISTS next_visit_date     date,
  ADD COLUMN IF NOT EXISTS whatsapp_reminders  boolean NOT NULL DEFAULT true;


-- ──────────────────────────────────────────────────────────
-- SECTION 2: EXTEND EXISTING followups TABLE
-- Adds all new columns needed for the full follow-up system.
-- The existing columns (id, customer_id, type, due_date,
-- priority, done, created_at) are NOT changed.
-- ──────────────────────────────────────────────────────────

-- 2a. New content columns
ALTER TABLE followups
  ADD COLUMN IF NOT EXISTS title          text,
  ADD COLUMN IF NOT EXISTS description    text;

-- 2b. Status column with enum constraint
--     Replaces the old boolean `done` field for richer status tracking.
--     `done` is kept for backward compatibility — existing queries still work.
ALTER TABLE followups
  ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'Pending';

ALTER TABLE followups
  DROP CONSTRAINT IF EXISTS followups_status_check;

ALTER TABLE followups
  ADD CONSTRAINT followups_status_check
  CHECK (status IN ('Pending', 'Due', 'Completed', 'Skipped', 'Cancelled'));

-- 2c. Priority column with constraint
--     The existing `priority` column already exists but has no constraint.
ALTER TABLE followups
  DROP CONSTRAINT IF EXISTS followups_priority_check;

ALTER TABLE followups
  ADD CONSTRAINT followups_priority_check
  CHECK (priority IN ('High', 'Medium', 'Low'));

-- 2d. Completion tracking columns
ALTER TABLE followups
  ADD COLUMN IF NOT EXISTS completed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by   text;

-- 2e. Timestamp — updated_at (created_at already exists)
ALTER TABLE followups
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz DEFAULT now();

-- 2f. Auto-generated follow-up tracking (for 30-day / 180-day)
ALTER TABLE followups
  ADD COLUMN IF NOT EXISTS auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_key   text;   -- unique per customer+type+purchase_date

-- 2g. WhatsApp tracking on follow-up row
ALTER TABLE followups
  ADD COLUMN IF NOT EXISTS whatsapp_sent  boolean NOT NULL DEFAULT false;

-- 2h. Unique index to prevent duplicate auto-follow-ups
--     Uses partial index — only applies when reminder_key is not null.
CREATE UNIQUE INDEX IF NOT EXISTS idx_followups_reminder_key
  ON followups (reminder_key)
  WHERE reminder_key IS NOT NULL;

-- 2i. Index for fast customer follow-up lookups
CREATE INDEX IF NOT EXISTS idx_followups_customer_id
  ON followups (customer_id);

-- 2j. Index for due-date filtering (used heavily in dashboard)
CREATE INDEX IF NOT EXISTS idx_followups_due_date
  ON followups (due_date);

-- 2k. Index for status filtering
CREATE INDEX IF NOT EXISTS idx_followups_status
  ON followups (status);

-- 2l. Keep `done` column in sync with the new `status` column
--     A trigger updates `done` whenever `status` changes, so
--     existing frontend code reading `done` continues to work.
CREATE OR REPLACE FUNCTION sync_followup_done()
RETURNS TRIGGER AS $$
BEGIN
  NEW.done      := (NEW.status = 'Completed');
  NEW.updated_at := now();

  -- Auto-fill completed_at when status set to Completed
  IF NEW.status = 'Completed' AND OLD.status <> 'Completed' THEN
    NEW.completed_at := now();
  END IF;

  -- Clear completed_at if status moved back to Pending / Due
  IF NEW.status IN ('Pending', 'Due') AND OLD.status = 'Completed' THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_followup_done ON followups;

CREATE TRIGGER trg_sync_followup_done
  BEFORE UPDATE ON followups
  FOR EACH ROW
  EXECUTE FUNCTION sync_followup_done();

-- 2m. Backfill: set status from existing `done` boolean for old rows
UPDATE followups
SET   status = CASE WHEN done = true THEN 'Completed' ELSE 'Pending' END
WHERE status = 'Pending'   -- only touch rows not yet migrated
  AND done   IS NOT NULL;


-- ──────────────────────────────────────────────────────────
-- SECTION 3: whatsapp_messages TABLE
-- Stores full history of every WhatsApp message sent.
-- Links to followups and customers.
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links (both nullable — message can exist without a follow-up)
  followup_id         uuid        REFERENCES followups(id) ON DELETE SET NULL,
  customer_id         uuid        REFERENCES customers(id) ON DELETE CASCADE,

  -- Denormalized for quick display without joins
  customer_name       text,
  phone               text        NOT NULL,

  -- Message classification
  message_type        text        NOT NULL,
  -- Values: '30day' | '180day' | 'glasses_ready' | 'payment_reminder'
  --         | 'next_visit' | 'custom'

  message_text        text,       -- full message body sent

  -- Delivery status
  message_status      text        NOT NULL DEFAULT 'pending',
  -- Values: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

  -- Official WhatsApp Business API response ID (if used)
  provider_message_id text,

  -- Timestamps
  sent_at             timestamptz DEFAULT now(),
  delivered_at        timestamptz,
  read_at             timestamptz,
  created_at          timestamptz DEFAULT now(),

  -- Error tracking
  error               text,

  -- Constraints
  CONSTRAINT whatsapp_messages_type_check CHECK (
    message_type IN (
      'welcome', '30day', '180day', 'glasses_ready',
      'payment_reminder', 'next_visit', 'custom'
    )
  ),
  CONSTRAINT whatsapp_messages_status_check CHECK (
    message_status IN ('pending', 'sent', 'delivered', 'read', 'failed')
  )
);

-- Indexes for whatsapp_messages
CREATE INDEX IF NOT EXISTS idx_wa_messages_customer_id
  ON whatsapp_messages (customer_id);

CREATE INDEX IF NOT EXISTS idx_wa_messages_followup_id
  ON whatsapp_messages (followup_id);

CREATE INDEX IF NOT EXISTS idx_wa_messages_sent_at
  ON whatsapp_messages (sent_at DESC);

-- ──────────────────────────────────────────────────────────
-- SECTION 4: whatsapp_settings TABLE
-- Global on/off toggles for automatic WhatsApp reminders.
-- Single-row table (fixed UUID so upsert is safe).
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_settings (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled               boolean NOT NULL DEFAULT true,
  welcome_message       boolean NOT NULL DEFAULT true,
  review_30day          boolean NOT NULL DEFAULT true,
  checkup_180day        boolean NOT NULL DEFAULT true,
  next_visit_reminder   boolean NOT NULL DEFAULT true,
  glasses_ready         boolean NOT NULL DEFAULT true,
  payment_reminder      boolean NOT NULL DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- Ensure welcome_message column exists if table was previously created
ALTER TABLE whatsapp_settings
  ADD COLUMN IF NOT EXISTS welcome_message boolean NOT NULL DEFAULT true;

-- Insert the single default settings row (idempotent)
INSERT INTO whatsapp_settings (
  id, enabled, welcome_message, review_30day, checkup_180day,
  next_visit_reminder, glasses_ready, payment_reminder
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  true, true, true, true, true, true, true
)
ON CONFLICT (id) DO NOTHING;


-- ──────────────────────────────────────────────────────────
-- SECTION 5: sheets_sync_log TABLE
-- Tracks every record synced to Google Sheets.
-- Enables Full Sync without duplicates and shows pending items.
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sheets_sync_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  record_type  text        NOT NULL,
  -- Values: 'customer' | 'prescription' | 'billing' | 'followup' | 'whatsapp'
  record_id    uuid        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending',
  -- Values: 'pending' | 'synced' | 'failed'
  error        text,
  synced_at    timestamptz,
  created_at   timestamptz DEFAULT now(),

  -- One sync log row per record (upserted, not duplicated)
  CONSTRAINT sheets_sync_log_unique UNIQUE (record_type, record_id)
);

CREATE INDEX IF NOT EXISTS idx_sheets_sync_status
  ON sheets_sync_log (status);

CREATE INDEX IF NOT EXISTS idx_sheets_sync_record
  ON sheets_sync_log (record_type, record_id);


-- ──────────────────────────────────────────────────────────
-- SECTION 6: ROW LEVEL SECURITY
-- All new tables: authenticated users can do everything.
-- Existing tables already have RLS — not changed.
-- ──────────────────────────────────────────────────────────

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheets_sync_log   ENABLE ROW LEVEL SECURITY;

-- Drop first (idempotent)
DROP POLICY IF EXISTS "Allow authenticated" ON whatsapp_messages;
DROP POLICY IF EXISTS "Allow authenticated" ON whatsapp_settings;
DROP POLICY IF EXISTS "Allow authenticated" ON sheets_sync_log;

CREATE POLICY "Allow authenticated" ON whatsapp_messages
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated" ON whatsapp_settings
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated" ON sheets_sync_log
  FOR ALL USING (auth.role() = 'authenticated');


-- ──────────────────────────────────────────────────────────
-- SECTION 7: VERIFY
-- Run after applying to confirm everything exists.
-- ──────────────────────────────────────────────────────────

-- Uncomment and run to verify:

-- SELECT column_name, data_type, column_default, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_name = 'followups'
-- ORDER  BY ordinal_position;

-- SELECT column_name, data_type
-- FROM   information_schema.columns
-- WHERE  table_name = 'customers'
-- ORDER  BY ordinal_position;

-- SELECT table_name
-- FROM   information_schema.tables
-- WHERE  table_schema = 'public'
--   AND  table_name IN (
--          'followups','customers','whatsapp_messages',
--          'whatsapp_settings','sheets_sync_log'
--        );
