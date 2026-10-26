# 🚀 WhatsApp Automation Guide
## Roja Opticals - Automated Follow-up System

---

## 📋 Overview

Your Roja Opticals system now includes **automated WhatsApp follow-up messages** that are sent to customers at 30 days and 180 days after their purchase. This system runs automatically every day and requires **no manual intervention**.

---

## ✨ Features

### 1. **Automatic Follow-up Scheduling**
- When a customer makes a **paid purchase**, the system automatically creates:
  - **30-Day Review** follow-up (comfort check for new glasses)
  - **180-Day Checkup** follow-up (6-month eye exam reminder)

### 2. **Daily Automated Processing**
- **Schedule**: Every day at **9:00 AM IST**
- The system checks all follow-ups that are due
- Automatically prepares WhatsApp messages for due customers
- Logs all messages in the database

### 3. **Smart Filtering**
- Only sends messages to customers who:
  - Have WhatsApp reminders enabled (per customer setting)
  - Have a valid phone number
  - Have follow-ups that are due or overdue
  - Haven't already received the message

### 4. **Message Templates**

#### 30-Day Review Message:
```
Hello [Name], this is Roja Opticals.

It has been 30 days since your recent purchase. We hope you are comfortable with your new glasses.

If you are experiencing any discomfort or have any issues, please contact us or visit Roja Opticals.

Thank you!
Roja Opticals
```

#### 180-Day Checkup Message:
```
Hello [Name], this is Roja Opticals.

It has been around 6 months since your last visit. This is a friendly reminder to schedule your next eye checkup.

Please contact Roja Opticals to book your visit.

Thank you!
Roja Opticals
```

---

## 🎛️ Control Panel (Settings Page)

### Global Controls
Navigate to **Settings** in your dashboard to access:

1. **Master Switch**: Enable/disable all WhatsApp automation
2. **30-Day Reviews**: Toggle 30-day review messages
3. **180-Day Checkups**: Toggle 180-day checkup messages
4. **Manual Trigger**: Run the scheduler immediately (for testing)

### Per-Customer Controls
Each customer has an individual WhatsApp preference:
- Go to **Customer Profile** → **Edit**
- Toggle "WhatsApp Reminders" on/off
- Customers with this disabled won't receive automated messages

---

## 🔄 How It Works

### Step 1: Purchase Triggers Follow-ups
```
Customer pays invoice
    ↓
System creates two follow-ups:
    • 30-Day Review (purchase_date + 30 days)
    • 180-Day Checkup (purchase_date + 180 days)
    ↓
Stored in database with unique reminder_key
```

### Step 2: Daily Scheduler Runs
```
Every day at 9:00 AM IST
    ↓
Check all follow-ups with:
    • due_date <= today
    • status = Pending or Due
    • whatsapp_sent = false
    • auto_generated = true
    ↓
For each qualifying follow-up:
    • Check global WhatsApp settings
    • Check customer WhatsApp preference
    • Generate message using template
    • Create WhatsApp URL (wa.me API)
    • Log message in whatsapp_messages table
    • Mark follow-up as whatsapp_sent = true
```

### Step 3: Message Delivery
The system uses **WhatsApp's free wa.me API**:
- Creates a click-to-chat URL with pre-filled message
- No API key or paid service required
- Messages are prepared and logged

---

## 📊 Database Tables

### 1. `followups` Table
Stores all follow-up tasks with these key fields:
- `due_date`: When the follow-up is due
- `auto_generated`: Whether created automatically (true for 30/180 day)
- `whatsapp_sent`: Whether WhatsApp message was sent
- `reminder_key`: Unique identifier to prevent duplicates (format: `{customerId}_30day_{purchaseDate}`)

### 2. `whatsapp_messages` Table
Logs every WhatsApp message:
- `message_type`: '30day' or '180day'
- `message_text`: Full message content
- `message_status`: 'pending', 'sent', 'delivered', 'read', 'failed'
- `sent_at`: Timestamp when message was prepared
- Links to customer and follow-up

### 3. `whatsapp_settings` Table
Global configuration (single row):
- `enabled`: Master switch for all automation
- `review_30day`: Enable/disable 30-day messages
- `checkup_180day`: Enable/disable 180-day messages

### 4. `customers` Table (extended)
Each customer has:
- `last_purchase_date`: Auto-updated on paid invoice
- `whatsapp_reminders`: Individual customer preference (default: true)

---

## 🛠️ Manual Trigger (Testing)

To test the system without waiting for 9:00 AM:

### Method 1: Settings Page
1. Go to **Settings** in dashboard
2. Scroll to **WhatsApp Automation** section
3. Click **"Run Scheduler Now (Manual Trigger)"**
4. Check server console for results

### Method 2: API Call
```bash
POST /api/whatsapp/run-now
Authorization: Bearer <your-token>
```

### Method 3: Server Console
```javascript
// In server terminal
const { runNow } = require('./lib/whatsappScheduler');
runNow();
```

---

## 📱 Integration Options

### Current Implementation (FREE)
- Uses WhatsApp Web API (wa.me)
- Creates pre-filled message links
- No cost, no API key required
- Messages are prepared but require manual click to send

### Upgrade Options (For True Automation)

#### Option 1: Twilio WhatsApp API (Paid)
```javascript
// Add to whatsappScheduler.js
const twilio = require('twilio');
const client = twilio(accountSid, authToken);

await client.messages.create({
  from: 'whatsapp:+14155238886',
  to: `whatsapp:+91${phone}`,
  body: messageText
});
```
- Cost: ~$0.005 per message
- Requires Twilio account and WhatsApp Business approval

#### Option 2: WhatsApp Business API (Paid)
- Official WhatsApp Business API
- Requires business verification
- Template approval required
- Cost: Varies by region

#### Option 3: Open-Source (Baileys)
```bash
npm install @whiskeysockets/baileys
```
- Free but requires setup
- Needs WhatsApp Web session
- Can be unstable

#### Option 4: Third-Party Services
- **Wati.io**: ₹1,999/month (500 conversations)
- **Gupshup**: Pay-per-message
- **Interakt**: Starting ₹899/month

---

## 🧪 Testing the System

### Test Scenario 1: Create a Test Customer
1. Add a customer with your phone number
2. Create a billing invoice for that customer
3. Mark the invoice as paid
4. Check `followups` table - you should see two new entries:
   - One for 30 days from now
   - One for 180 days from now

### Test Scenario 2: Manually Set Due Date
```sql
-- In Supabase SQL Editor
UPDATE followups
SET due_date = CURRENT_DATE
WHERE customer_id = 'your-test-customer-id'
  AND auto_generated = true
  AND whatsapp_sent = false;
```

### Test Scenario 3: Run Scheduler
1. Go to Settings → WhatsApp Automation
2. Click "Run Scheduler Now"
3. Check server logs for output:
```
[WhatsApp Scheduler] Starting daily follow-up check...
[WhatsApp Scheduler] Found 2 due follow-ups
[WhatsApp] Message prepared for John Doe (9876543210)
[WhatsApp] Type: 30day
[WhatsApp] URL: https://wa.me/919876543210?text=...
```

### Test Scenario 4: Check Message History
```sql
-- View all sent messages
SELECT * FROM whatsapp_messages
ORDER BY sent_at DESC;
```

Or via API:
```bash
GET /api/whatsapp/messages
```

---

## 🔍 Monitoring & Logs

### Server Logs
The scheduler outputs detailed logs:
```
[WhatsApp Scheduler] Starting daily follow-up check...
[WhatsApp Scheduler] Time: 2026-08-17T09:00:00.000Z
[WhatsApp Scheduler] Found 5 due follow-ups
[WhatsApp] Message prepared for Rajesh Kumar (9876543210)
[WhatsApp] Type: 30day
[WhatsApp] Message ID: abc-123-def
[WhatsApp] Skipping Priya Singh: WhatsApp reminders disabled
[WhatsApp Scheduler] Summary:
  ✓ Sent: 4
  ⊘ Skipped: 1
  ✗ Failed: 0
[WhatsApp Scheduler] Completed.
```

### Database Queries

#### View Pending Follow-ups
```sql
SELECT 
  f.due_date,
  f.type,
  f.whatsapp_sent,
  c.name,
  c.phone,
  c.whatsapp_reminders
FROM followups f
JOIN customers c ON f.customer_id = c.id
WHERE f.due_date <= CURRENT_DATE
  AND f.auto_generated = true
  AND f.whatsapp_sent = false
  AND f.status IN ('Pending', 'Due')
ORDER BY f.due_date;
```

#### View Message History
```sql
SELECT 
  sent_at::date as date,
  message_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE message_status = 'sent') as sent,
  COUNT(*) FILTER (WHERE message_status = 'failed') as failed
FROM whatsapp_messages
GROUP BY sent_at::date, message_type
ORDER BY sent_at::date DESC;
```

---

## ⚙️ Configuration

### Change Schedule Time
Edit `server/lib/whatsappScheduler.js`:
```javascript
const CRON_SCHEDULE = '0 9 * * *'; // Daily at 9:00 AM
// Change to:
const CRON_SCHEDULE = '0 14 * * *'; // Daily at 2:00 PM
// Or:
const CRON_SCHEDULE = '0 9,15 * * *'; // 9 AM and 3 PM
```

### Change Timezone
```javascript
cron.schedule(CRON_SCHEDULE, processFollowups, {
  timezone: 'Asia/Kolkata' // Change to your timezone
});
```

### Enable Dry Run (Testing)
```javascript
const DRY_RUN = true; // Messages logged but not created
```

### Customize Message Templates
Edit `server/lib/whatsapp.js`:
```javascript
'30day': (name) =>
  `Hello ${name}, this is Roja Opticals.\n\n` +
  `Your custom message here...`
```

---

## 🚨 Troubleshooting

### Issue: Scheduler Not Running
**Check:**
1. Server is running (`npm start` in `server/` directory)
2. No errors in server logs
3. `node-cron` is installed (`npm install` in `server/`)

### Issue: No Messages Being Sent
**Check:**
1. WhatsApp automation is enabled (Settings → Master Switch)
2. Customer has WhatsApp reminders enabled
3. Follow-up `due_date` is today or in the past
4. Follow-up `whatsapp_sent` is false
5. Customer has a valid phone number

### Issue: Duplicate Follow-ups
The system prevents duplicates using `reminder_key`:
- Format: `{customerId}_30day_{purchaseDate}`
- Unique constraint in database
- If customer purchases again, new follow-ups are created for new date

### Issue: Wrong Phone Format
WhatsApp URLs require international format:
- System auto-adds India country code (91)
- Removes spaces, dashes, parentheses
- Format: `919876543210` (no + sign in wa.me URL)

---

## 📈 Future Enhancements

### Planned Features
- [ ] SMS fallback for customers without WhatsApp
- [ ] Email notifications as backup
- [ ] Custom message templates per customer
- [ ] A/B testing for message content
- [ ] Delivery status tracking (read receipts)
- [ ] Response handling (reply detection)
- [ ] Multi-language support
- [ ] Smart send times based on customer preferences

### Integration Roadmap
1. ✅ **Phase 1 (Current)**: Free wa.me links, manual sending
2. 🔄 **Phase 2**: Twilio integration for auto-send
3. 📋 **Phase 3**: WhatsApp Business API with templates
4. 🎯 **Phase 4**: AI-powered message personalization

---

## 🎯 Best Practices

### 1. **Test Before Launch**
- Use test customers with your own phone number
- Set due dates to today for immediate testing
- Check message formatting on mobile device

### 2. **Monitor Regularly**
- Check server logs daily
- Review message history weekly
- Track customer responses

### 3. **Respect Customer Preferences**
- Always honor the per-customer WhatsApp toggle
- Provide easy opt-out mechanism
- Follow WhatsApp Business policies

### 4. **Maintain Message Quality**
- Keep messages professional and concise
- Always include shop name and reason for message
- Provide clear call-to-action

### 5. **Compliance**
- Follow local regulations (TRAI guidelines in India)
- Don't spam - stick to relevant follow-ups only
- Respect quiet hours (9 AM is good start time)

---

## 📞 Support

For issues or questions:
1. Check server logs: `server/` directory console
2. Review Supabase dashboard: Check `followups` and `whatsapp_messages` tables
3. Test manually: Use Settings → Run Scheduler Now

---

## 📝 Change Log

### Version 1.0 (August 2026)
- Initial automated WhatsApp system
- 30-day and 180-day follow-ups
- Daily scheduler (9:00 AM IST)
- Global and per-customer controls
- Message history logging
- Manual trigger for testing

---

**Status**: ✅ Active and Running
**Last Updated**: August 17, 2026
**Maintained by**: Roja Opticals Development Team
