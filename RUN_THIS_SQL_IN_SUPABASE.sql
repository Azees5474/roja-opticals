-- ═══════════════════════════════════════════════════════════
-- IMPORTANT: Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Add welcome_message column to whatsapp_settings
ALTER TABLE whatsapp_settings
  ADD COLUMN IF NOT EXISTS welcome_message boolean NOT NULL DEFAULT true;

-- 2. Enable welcome messages
UPDATE whatsapp_settings
SET welcome_message = true
WHERE id = '00000000-0000-0000-0000-000000000001';

-- 3. Update whatsapp_messages constraint to include 'welcome'
ALTER TABLE whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_type_check;

ALTER TABLE whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_type_check CHECK (
    message_type IN (
      'welcome', '30day', '180day', 'glasses_ready',
      'payment_reminder', 'next_visit', 'custom'
    )
  );

-- 4. Verify settings
SELECT * FROM whatsapp_settings;

-- You should see: welcome_message = true

-- ═══════════════════════════════════════════════════════════
-- After running this, restart your server and try again!
-- ═══════════════════════════════════════════════════════════
