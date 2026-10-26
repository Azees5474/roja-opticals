/**
 * autoFollowup.js
 * ──────────────────────────────────────────────────────────
 * Handles automatic follow-up scheduling based on the
 * customer's LATEST completed purchase date.
 *
 * Rules:
 *  - 30-Day Review  = purchaseDate + 30 days
 *  - 180-Day Checkup = purchaseDate + 180 days
 *  - Both are based on the LATEST paid invoice date — never
 *    on registration date, prescription date, or creation date.
 *  - If the customer purchases again later, new follow-ups are
 *    created for the new purchase date. Old ones are NOT deleted
 *    (history is preserved). New ones use new reminder_key so
 *    no duplicates are created.
 *  - Duplicate prevention: reminder_key is UNIQUE in the DB.
 *    Format: `{customerId}_{type}_{purchaseDate}`
 *    e.g.  `abc123_30day_2026-08-07`
 */

const supabase = require('./supabase')

/**
 * Add N calendar days to a yyyy-mm-dd string.
 * Returns yyyy-mm-dd string.
 */
function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Returns the latest paid billing date for a customer.
 * This is what the 30/180 day schedule is based on.
 * Fetches directly from the billing table — never trusts
 * any cached date.
 */
async function getLatestPurchaseDate(customerId) {
  const { data, error } = await supabase
    .from('billing')
    .select('created_at')
    .eq('customer_id', customerId)
    .eq('paid', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return null
  return data[0].created_at.slice(0, 10)
}

/**
 * Main function — called whenever an invoice is marked paid.
 *
 * @param {string} customerId   - UUID of the customer
 * @param {string} purchaseDate - yyyy-mm-dd of the paid invoice
 *
 * What it does:
 * 1. Verifies purchaseDate is actually the LATEST paid purchase
 *    (guards against race conditions / out-of-order calls)
 * 2. Updates customers.last_purchase_date
 * 3. Creates 30-day and 180-day follow-up rows
 *    — uses ON CONFLICT on reminder_key so duplicates are silently ignored
 * 4. Does NOT delete or modify any existing follow-up history
 */
async function createAutoFollowups(customerId, purchaseDate) {
  if (!customerId || !purchaseDate) return

  // ── Step 1: Fetch the real latest paid purchase date ──
  const latestDate = await getLatestPurchaseDate(customerId)

  // Use whichever is later — the date passed in or the DB query
  // (They should match, but this guards against stale data)
  const effectiveDate = latestDate && latestDate > purchaseDate
    ? latestDate
    : purchaseDate

  // ── Step 2: Update customers.last_purchase_date ───────
  await supabase
    .from('customers')
    .update({ last_purchase_date: effectiveDate })
    .eq('id', customerId)

  // ── Step 3: Define the follow-ups to create ──────────
  const schedule = [
    {
      type:         '30-Day Review',
      title:        '30-Day Review',
      description:  `Check if customer is comfortable with their new glasses. Purchase date: ${effectiveDate}`,
      days:         30,
      priority:     'Medium',
      reminderKey:  `${customerId}_30day_${effectiveDate}`,
    },
    {
      type:         '180-Day Eye Checkup',
      title:        '180-Day Eye Checkup',
      description:  `6-month routine eye checkup reminder. Purchase date: ${effectiveDate}`,
      days:         180,
      priority:     'Medium',
      reminderKey:  `${customerId}_180day_${effectiveDate}`,
    },
  ]

  // ── Step 4: Insert — silently skip if already exists ─
  for (const item of schedule) {
    const dueDate = addDays(effectiveDate, item.days)

    // Check existence manually — most reliable across Supabase JS versions
    const { data: existing } = await supabase
      .from('followups')
      .select('id')
      .eq('reminder_key', item.reminderKey)
      .limit(1)

    if (existing && existing.length > 0) {
      // Already exists for this purchase date — skip (preserve history)
      continue
    }

    const { error } = await supabase.from('followups').insert([{
      customer_id:    customerId,
      type:           item.type,
      title:          item.title,
      description:    item.description,
      due_date:       dueDate,
      priority:       item.priority,
      status:         'Pending',
      done:           false,
      auto_generated: true,
      whatsapp_sent:  false,
      reminder_key:   item.reminderKey,
    }])

    if (error) {
      // Log but never crash — if it's a unique constraint violation,
      // that just means it was already created (safe to ignore)
      if (!error.message?.includes('unique') && !error.code?.includes('23505')) {
        console.error(`[AutoFollowup] Failed to create ${item.type} for ${customerId}:`, error.message)
      }
    }
  }
}

/**
 * Set or clear a customer's Next Visit Date.
 * This is completely independent of purchase-based follow-ups.
 *
 * @param {string}      customerId    - UUID
 * @param {string|null} nextVisitDate - yyyy-mm-dd or null to clear
 */
async function setNextVisitDate(customerId, nextVisitDate) {
  if (!customerId) return { error: 'customerId is required' }

  const { data, error } = await supabase
    .from('customers')
    .update({ next_visit_date: nextVisitDate || null })
    .eq('id', customerId)
    .select('id, name, next_visit_date')
    .single()

  if (error) return { error: error.message }
  return { data }
}

/**
 * Get a summary of follow-up schedule for a customer.
 * Used for the customer profile "Follow-ups" tab display.
 *
 * Returns:
 *  - lastPurchaseDate
 *  - review30dueDate   (last_purchase + 30)
 *  - checkup180dueDate (last_purchase + 180)
 *  - nextVisitDate     (manual, from customers table)
 *  - followups         (all follow-up rows for this customer)
 */
async function getCustomerFollowupSummary(customerId) {
  const [customerResult, followupsResult] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, last_purchase_date, next_visit_date')
      .eq('id', customerId)
      .single(),
    supabase
      .from('followups')
      .select('*')
      .eq('customer_id', customerId)
      .order('due_date', { ascending: true }),
  ])

  if (customerResult.error) return { error: customerResult.error.message }

  const customer = customerResult.data
  const followups = followupsResult.data || []

  const summary = {
    lastPurchaseDate:   customer.last_purchase_date || null,
    review30dueDate:    customer.last_purchase_date ? addDays(customer.last_purchase_date, 30)  : null,
    checkup180dueDate:  customer.last_purchase_date ? addDays(customer.last_purchase_date, 180) : null,
    nextVisitDate:      customer.next_visit_date || null,
    followups,
  }

  return { data: summary }
}

module.exports = {
  createAutoFollowups,
  setNextVisitDate,
  getCustomerFollowupSummary,
  getLatestPurchaseDate,
  addDays,
}
