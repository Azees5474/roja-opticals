# 👋 Welcome Message Feature Guide

## Overview

The Welcome Message feature automatically sends a WhatsApp welcome message to new customers when they are registered in your system.

---

## ✨ Features

### Automatic Welcome Messages
- Sent immediately when a new customer is added
- Includes shop details (name, address, phone)
- Professional and welcoming tone
- Can be enabled/disabled globally

### Smart Control
- **Global toggle** in Settings → WhatsApp Automation
- **Per-customer control** via customer's WhatsApp Reminders setting
- **Automatic logging** in database
- **Click-to-send** option in UI

---

## 📱 Welcome Message Template

```
Hello [Customer Name], Welcome to Roja Opticals! 👓

Thank you for choosing us for your eye care needs.

We are committed to providing you with the best quality eyewear 
and exceptional service.

Feel free to contact us anytime for assistance or to book an 
appointment.

Address: 12, Gandhi Street, Salem – 636 001, Tamil Nadu
Phone: 9876543210

We look forward to serving you!

Best regards,
Roja Opticals
```

---

## 🔧 Setup Instructions

### Step 1: Run Database Migration

Go to **Supabase Dashboard** → **SQL Editor** → Run this:

```sql
-- Add welcome message support
ALTER TABLE whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_type_check;

ALTER TABLE whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_type_check CHECK (
    message_type IN (
      'welcome', '30day', '180day', 'glasses_ready',
      'payment_reminder', 'next_visit', 'custom'
    )
  );

-- Add welcome_message setting
ALTER TABLE whatsapp_settings
  ADD COLUMN IF NOT EXISTS welcome_message boolean NOT NULL DEFAULT true;

UPDATE whatsapp_settings
SET welcome_message = true
WHERE id = '00000000-0000-0000-0000-000000000001';
```

### Step 2: Restart Server

The server is already updated with the new code. Just restart:

```bash
cd server
npm start
```

### Step 3: Refresh Frontend

Refresh your browser at http://localhost:5173/

---

## 🎯 How It Works

### Flow Diagram

```
User adds new customer
    ↓
Customer saved in database
    ↓
Backend checks settings:
    • Global WhatsApp enabled?
    • Welcome messages enabled?
    • Customer has phone number?
    • Customer WhatsApp reminders enabled?
    ↓
If all YES:
    • Generate welcome message
    • Create WhatsApp URL
    • Log in whatsapp_messages table
    • Return URL to frontend
    ↓
Frontend shows prompt:
    "Send welcome message to [Name]?"
    ↓
If user clicks YES:
    • Opens WhatsApp Web/App
    • Message pre-filled
    • User clicks send
```

---

## 🎛️ Controls

### Global Settings (Settings Page)

1. Go to **Settings** → **WhatsApp Automation**
2. Find **"Welcome Messages"** toggle
3. Enable/disable as needed

**Note:** This is controlled by the Master Switch too. If Master Switch is OFF, welcome messages won't be sent.

### Per-Customer Setting

Each customer has individual control:

1. Go to **Customer Profile** → **Edit**
2. Toggle **"WhatsApp Reminders"**
3. If disabled, no WhatsApp messages (including welcome) will be sent to this customer

---

## 📊 Testing

### Test Scenario 1: Add a New Customer

1. **Go to Customers page**
2. **Click "Add Customer"**
3. **Enter details**:
   - Name: Test Customer
   - Phone: Your phone number (e.g., 9876543210)
   - Email: (optional)
   - Age: (optional)
4. **Click "Save"**
5. **Popup will ask**: "Send welcome message to Test Customer?"
6. **Click OK** → WhatsApp opens with pre-filled message
7. **Click Send** in WhatsApp

### Test Scenario 2: Check Database Logging

```sql
-- View all welcome messages
SELECT 
  customer_name,
  phone,
  message_text,
  sent_at,
  message_status
FROM whatsapp_messages
WHERE message_type = 'welcome'
ORDER BY sent_at DESC;
```

### Test Scenario 3: Verify Settings Control

1. **Go to Settings** → WhatsApp Automation
2. **Disable "Welcome Messages"**
3. **Add a new customer**
4. **No welcome message prompt should appear**
5. **Re-enable "Welcome Messages"**
6. **Add another customer**
7. **Welcome message prompt appears**

---

## 🔍 Monitoring

### Server Logs

When a customer is added, check server console:

```
[Welcome Message] Prepared for Rajesh Kumar (9876543210)
[Welcome Message] URL: https://wa.me/919876543210?text=...
```

### Database Queries

#### View All Welcome Messages
```sql
SELECT * FROM whatsapp_messages
WHERE message_type = 'welcome'
ORDER BY sent_at DESC;
```

#### Count Welcome Messages Today
```sql
SELECT COUNT(*) as welcome_messages_today
FROM whatsapp_messages
WHERE message_type = 'welcome'
  AND sent_at::date = CURRENT_DATE;
```

#### Customer Registration + Welcome Message Stats
```sql
SELECT 
  DATE(c.created_at) as date,
  COUNT(DISTINCT c.id) as customers_added,
  COUNT(w.id) as welcome_messages_sent
FROM customers c
LEFT JOIN whatsapp_messages w 
  ON w.customer_id = c.id 
  AND w.message_type = 'welcome'
WHERE c.created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(c.created_at)
ORDER BY date DESC;
```

---

## ⚙️ Customization

### Change Welcome Message Content

Edit `server/lib/whatsapp.js`:

```javascript
'welcome': (name) =>
  `Hello ${name}, Welcome to Roja Opticals! 👓\n\n` +
  `Your custom message here...\n\n` +
  `Thank you!\nRoja Opticals`,
```

### Change Shop Details in Message

Update these lines in the welcome template:

```javascript
`Address: 12, Gandhi Street, Salem – 636 001, Tamil Nadu\n` +
`Phone: 9876543210\n\n` +
```

### Auto-Send Without Confirmation

If you want to auto-open WhatsApp without asking, edit `app/src/pages/Customers.jsx`:

```javascript
// Change this:
if (confirm(`Send welcome message to ${newCust.name}?`)) {
  window.open(newCust.welcomeMessage.url, '_blank')
}

// To this:
if (newCust.welcomeMessage && newCust.welcomeMessage.success) {
  window.open(newCust.welcomeMessage.url, '_blank')
}
```

---

## 🚨 Troubleshooting

### Issue: No Welcome Message Prompt

**Check:**
1. ✅ Settings → WhatsApp Automation → Master Switch ON
2. ✅ Settings → WhatsApp Automation → Welcome Messages ON
3. ✅ Customer has phone number
4. ✅ Customer WhatsApp Reminders enabled (default: ON)
5. ✅ Server is running
6. ✅ Database migration completed

**Solution:**
```sql
-- Check settings
SELECT enabled, welcome_message 
FROM whatsapp_settings 
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Should return: enabled = true, welcome_message = true
```

### Issue: Database Constraint Error

**Error:** `violates check constraint "whatsapp_messages_type_check"`

**Solution:** Run the database migration:
```sql
ALTER TABLE whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_type_check;

ALTER TABLE whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_type_check CHECK (
    message_type IN (
      'welcome', '30day', '180day', 'glasses_ready',
      'payment_reminder', 'next_visit', 'custom'
    )
  );
```

### Issue: WhatsApp Opens But Message is Empty

**Check:** Make sure customer name was saved correctly
**Solution:** The template uses customer name. Verify customer data:
```sql
SELECT id, name, phone FROM customers 
WHERE id = 'customer-id';
```

---

## 📈 Benefits

### For Your Business
- ✅ **Professional first impression**
- ✅ **Immediate engagement** with new customers
- ✅ **Share contact details** automatically
- ✅ **Build trust** from day one
- ✅ **Reduce no-shows** by providing clear contact info

### For Your Customers
- ✅ **Feel welcomed** and valued
- ✅ **Have your contact details** saved in WhatsApp
- ✅ **Easy to reach you** for appointments
- ✅ **Know they're at the right place**

---

## 📋 Best Practices

### 1. Keep Message Professional
- Use proper grammar
- Include essential contact info
- Keep it concise (under 300 characters)

### 2. Test First
- Add a test customer with your own phone
- Verify message formatting
- Check WhatsApp formatting (line breaks, emojis)

### 3. Monitor Responses
- Check if customers reply
- Track engagement
- Adjust message if needed

### 4. Respect Customer Preferences
- Always honor opt-out requests
- Don't re-enable without permission
- Keep unsubscribe mechanism clear

---

## 🔄 Integration with Other Features

### Works With:
- ✅ **30-Day Follow-ups**: Welcome → 30-day review
- ✅ **180-Day Follow-ups**: Welcome → 6-month checkup
- ✅ **Customer Profile**: All messages logged per customer
- ✅ **Billing**: Purchase triggers follow-ups after welcome
- ✅ **Google Sheets**: Welcome messages synced (if configured)

### Workflow Example:

```
Day 0: Customer registered → Welcome message sent
    ↓
Day 0: Purchase made → 30-day & 180-day follow-ups scheduled
    ↓
Day 30: 30-day review message sent automatically
    ↓
Day 180: 180-day checkup message sent automatically
```

---

## 💰 Cost

**FREE** - Uses WhatsApp Web API (wa.me)
- No API key required
- No per-message charges
- No subscription needed

---

## 📊 Statistics Tracking

### SQL Queries for Reporting

#### Welcome Message Conversion Rate
```sql
-- Customers registered vs welcome messages sent
SELECT 
  (SELECT COUNT(*) FROM customers WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as customers_added,
  (SELECT COUNT(*) FROM whatsapp_messages WHERE message_type = 'welcome' AND sent_at >= CURRENT_DATE - INTERVAL '30 days') as welcome_sent,
  ROUND(
    (SELECT COUNT(*) FROM whatsapp_messages WHERE message_type = 'welcome' AND sent_at >= CURRENT_DATE - INTERVAL '30 days')::numeric / 
    NULLIF((SELECT COUNT(*) FROM customers WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'), 0) * 100, 
    2
  ) as conversion_rate_percentage;
```

#### Daily Welcome Message Report
```sql
SELECT 
  DATE(sent_at) as date,
  COUNT(*) as messages_sent,
  COUNT(DISTINCT customer_id) as unique_customers
FROM whatsapp_messages
WHERE message_type = 'welcome'
  AND sent_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(sent_at)
ORDER BY date DESC;
```

---

## 🎊 Summary

Welcome Messages are now:
- ✅ **Implemented** in backend
- ✅ **Integrated** with customer creation
- ✅ **Controllable** via Settings
- ✅ **Logged** in database
- ✅ **Free** forever
- ✅ **Ready to use**

**Just run the database migration and start adding customers!** 🚀

---

**Created:** August 17, 2026  
**Feature:** Welcome Message Automation  
**Cost:** Free (WhatsApp Web API)  
**Status:** Production Ready ✅
