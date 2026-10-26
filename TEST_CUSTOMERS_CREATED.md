# 🧪 Test Customers Created for Follow-up Testing

## Summary

I've created **2 test customers** with backdated records to test the follow-up notification system!

## Test Customer #1: 30-Day Follow-up

### Customer Details
- **Name:** Test Customer 30 Days
- **Phone:** 9999999999
- **Email:** test30days@example.com
- **Created:** 30 days ago (July 31, 2026)
- **Customer ID:** `0783f9fb-23b3-45e7-b2eb-3c38e8be39ba`

### Follow-ups
- ✅ **30-Day Review** - DUE TODAY! (August 30, 2026)
  - Type: 30day
  - Priority: High
  - Status: Pending
  - Description: Check if customer is comfortable with glasses

- 📅 **180-Day Checkup** - Due January 27, 2027
  - Type: 180day
  - Priority: Medium
  - Status: Pending

## Test Customer #2: 180-Day Follow-up

### Customer Details
- **Name:** Test Customer 180 Days
- **Phone:** 8888888888
- **Email:** test180days@example.com
- **Created:** 6 months ago (March 3, 2026)
- **Customer ID:** `39c834dd-25e7-4503-a078-654142d0767b`

### Follow-ups
- ✅ **30-Day Review** - Completed (April 2, 2026)
  - Type: 30day
  - Status: Done
  - Marked as completed (in the past)

- ✅ **180-Day Checkup** - DUE TODAY! (August 30, 2026)
  - Type: 180day
  - Priority: High
  - Status: Pending
  - Description: Remind customer about next eye checkup

## How to Test

### Dashboard Testing

1. **Go to Dashboard** (http://localhost:5173)

2. **Check "Follow-ups Today" Section**
   - You should see **2 follow-ups** due today:
     - 🔴 Test Customer 30 Days (High Priority)
     - 🔴 Test Customer 180 Days (High Priority)

3. **Test WhatsApp Reminder**
   - Click the 📱 button next to either customer
   - WhatsApp should open with the appropriate reminder message
   - For 30-day: "It has been 30 days since your recent purchase..."
   - For 180-day: "It has been around 6 months since your last visit..."

### Follow-ups Page Testing

1. **Go to Follow-ups Page**

2. **View All Pending Follow-ups**
   - Filter by "Pending" status
   - Both test customers should appear

3. **Test Features**
   - ✅ Send WhatsApp reminder (📱 button)
   - ✅ Mark as done (✓ checkbox)
   - ✅ Edit follow-up details
   - ✅ Check if "whatsapp_sent" flag updates

### WhatsApp Message Templates

**30-Day Follow-up:**
```
Hello Test Customer 30 Days, this is Roja Opticals.

It has been 30 days since your recent purchase. We hope you are comfortable with your new glasses.

If you are experiencing any discomfort or have any issues, please contact us or visit Roja Opticals.

Thank you!
Roja Opticals
```

**180-Day Follow-up:**
```
Hello Test Customer 180 Days, this is Roja Opticals.

It has been around 6 months since your last visit. This is a friendly reminder to schedule your next eye checkup.

Please contact Roja Opticals to book your visit.

Thank you!
Roja Opticals
```

## What to Verify

### ✅ Dashboard
- [ ] Both follow-ups appear in "Follow-ups Today" section
- [ ] Priority badges show correctly (High for both)
- [ ] Customer names display properly
- [ ] WhatsApp buttons (📱) are visible and clickable

### ✅ WhatsApp Integration
- [ ] Clicking 📱 opens WhatsApp
- [ ] Correct phone number is used (9999999999 or 8888888888)
- [ ] Message template is appropriate (30day vs 180day)
- [ ] Message is pre-filled and ready to send

### ✅ Follow-up Management
- [ ] Can mark follow-ups as done
- [ ] "whatsapp_sent" flag updates when clicked
- [ ] Follow-up disappears from "Due Today" when marked done
- [ ] Can edit follow-up details

### ✅ Statistics
- [ ] Dashboard shows correct "Follow-ups Due" count
- [ ] Count updates when follow-ups are marked done

## Cleanup (Optional)

If you want to remove the test customers later:

```sql
-- Run in Supabase SQL Editor
DELETE FROM followups WHERE customer_id IN (
  '0783f9fb-23b3-45e7-b2eb-3c38e8be39ba',
  '39c834dd-25e7-4503-a078-654142d0767b'
);

DELETE FROM customers WHERE id IN (
  '0783f9fb-23b3-45e7-b2eb-3c38e8be39ba',
  '39c834dd-25e7-4503-a078-654142d0767b'
);
```

Or keep them for ongoing testing!

## Test Scripts Location

The scripts used to create these test customers are saved at:
- `server/test-followup.js` - Creates 30-day test customer
- `server/test-followup-180.js` - Creates 180-day test customer

You can run them again anytime to create more test data:
```bash
cd server
node test-followup.js
node test-followup-180.js
```

## Expected Behavior

### Automatic Follow-up Creation
When you add a real customer through the app:
1. 30-day follow-up is automatically created (due in 30 days)
2. 180-day follow-up is automatically created (due in 180 days)

### Follow-up Notifications
The WhatsApp scheduler runs daily at 9:00 AM:
1. Finds all follow-ups due today
2. Sends WhatsApp reminders automatically (if Twilio is configured)
3. Or generates wa.me URLs for manual sending

### Manual Follow-ups
You can also create custom follow-ups:
- Next visit reminder
- Glasses ready for pickup
- Payment reminder
- Custom messages

## Status

✅ **Test data created successfully!**
✅ **Both customers have follow-ups due TODAY**
✅ **Ready to test the complete follow-up system**

Go ahead and refresh your Dashboard to see the follow-ups! 🎉
