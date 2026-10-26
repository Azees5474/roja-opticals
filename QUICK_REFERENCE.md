# 📱 WhatsApp Automation - Quick Reference Card

## 🚀 ONE-TIME SETUP

### 1. Run This SQL in Supabase
```sql
ALTER TABLE whatsapp_messages DROP CONSTRAINT IF EXISTS whatsapp_messages_type_check;
ALTER TABLE whatsapp_messages ADD CONSTRAINT whatsapp_messages_type_check CHECK (message_type IN ('welcome', '30day', '180day', 'glasses_ready', 'payment_reminder', 'next_visit', 'custom'));
ALTER TABLE whatsapp_settings ADD COLUMN IF NOT EXISTS welcome_message boolean NOT NULL DEFAULT true;
UPDATE whatsapp_settings SET welcome_message = true WHERE id = '00000000-0000-0000-0000-000000000001';
```

### 2. Check Servers
- Frontend: http://localhost:5173/ ✅
- Backend: http://localhost:5000/ ✅

### 3. Enable in Settings
Settings → WhatsApp Automation → Turn ON all toggles

---

## 📨 MESSAGE TYPES

| Type | Trigger | Timing | Content |
|------|---------|--------|---------|
| **Welcome** | New customer added | Immediately | Welcome message with shop details |
| **30-Day Review** | Invoice paid | +30 days | Comfort check for glasses |
| **180-Day Checkup** | Invoice paid | +180 days | 6-month eye exam reminder |

---

## 🎯 DAILY USE

### Add New Customer
1. Customers → Add Customer
2. Enter name + phone
3. Save → Popup appears
4. Click OK → WhatsApp opens
5. Click Send in WhatsApp

### Create Follow-ups
1. Customer makes purchase
2. Create invoice
3. Mark as **PAID** ✅
4. System auto-creates 30 & 180 day follow-ups

### Automatic Sending
- Runs: Daily at 9:00 AM IST
- Checks: Due follow-ups
- Sends: WhatsApp messages
- Logs: Everything in database

---

## ⚙️ CONTROLS

### Settings Page
- **Master Switch**: All automation on/off
- **Welcome Messages**: New customer messages
- **30-Day Reviews**: Comfort check messages
- **180-Day Checkups**: Eye exam reminders
- **Run Now**: Manual test trigger

### Per Customer
- Customer Profile → Edit
- Toggle "WhatsApp Reminders"
- Individual opt-in/out

---

## 🔍 MONITORING

### Server Logs
```
[Welcome Message] Prepared for Name (phone)
[WhatsApp Scheduler] Found X due follow-ups
[WhatsApp] Message prepared for Name
```

### Database Queries
```sql
-- All messages today
SELECT * FROM whatsapp_messages 
WHERE sent_at::date = CURRENT_DATE;

-- Pending follow-ups
SELECT * FROM followups 
WHERE whatsapp_sent = false 
AND due_date <= CURRENT_DATE;
```

---

## 🚨 QUICK FIXES

### CORS Error
`server/.env` → Change to: `CLIENT_URL=http://localhost:5173`

### No Welcome Message
Check: Settings → Master Switch ON + Welcome Messages ON

### Scheduler Not Running
Check: Server console shows "Started successfully!"

### Database Error
Re-run the SQL migration script above

---

## 💰 COST
**FREE** - Uses WhatsApp Web API (wa.me)
- No API key needed
- No subscription
- No per-message fees
- **₹0 Forever**

---

## 📞 MESSAGE TEMPLATES

**Welcome:**
```
Hello [Name], Welcome to Roja Opticals! 👓
Thank you for choosing us...
[Shop details]
```

**30-Day:**
```
Hello [Name], this is Roja Opticals.
It has been 30 days since your purchase...
```

**180-Day:**
```
Hello [Name], this is Roja Opticals.
It has been 6 months since your last visit...
```

---

## ✅ STATUS CHECK

All systems operational if:
- ✅ Frontend loads (localhost:5173)
- ✅ Backend running (localhost:5000)
- ✅ Server shows "Started successfully!"
- ✅ Settings page shows toggles
- ✅ Test customer → Welcome message appears

---

## 📚 FULL DOCS

- Setup: `WHATSAPP_SETUP_SUMMARY.md`
- Details: `WHATSAPP_AUTOMATION_GUIDE.md`
- Welcome: `WELCOME_MESSAGE_GUIDE.md`
- Testing: `TEST_WELCOME_MESSAGE.md`
- Complete: `COMPLETE_IMPLEMENTATION_SUMMARY.md`

---

**Status**: 🟢 OPERATIONAL  
**Cost**: FREE  
**Work Required**: ZERO (Automated)  

🎉 **Just add customers and let it work!**
