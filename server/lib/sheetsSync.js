/**
 * sheetsSync.js
 * Non-blocking Google Sheets synchronization.
 * Supabase is ALWAYS the primary database.
 * Sheets failure NEVER breaks the main flow.
 */
const { google } = require('googleapis');
const path       = require('path');
const supabase   = require('./supabase');

const SHEET_ID   = process.env.GOOGLE_SHEET_ID;
const KEY_PATH   = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

let _sheets = null;

async function getSheetsClient() {
  if (_sheets) return _sheets;
  if (!KEY_PATH || !SHEET_ID) return null;
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(KEY_PATH),
      scopes:  ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const authClient = await auth.getClient();
    _sheets = google.sheets({ version: 'v4', auth: authClient });
    return _sheets;
  } catch {
    return null;
  }
}

// ── Append or update a row identified by its ID in col A ─
async function upsertRow(sheetName, id, values) {
  const client = await getSheetsClient();
  if (!client) return false;

  try {
    // Read all IDs in col A to find existing row
    const read = await client.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${sheetName}!A:A`,
    });
    const rows = read.data.values || [];
    const rowIndex = rows.findIndex(r => r[0] === id);

    if (rowIndex > 0) {
      // Update existing row (1-indexed, skip header row 1)
      await client.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A${rowIndex + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [values] },
      });
    } else {
      // Append new row
      await client.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: [values] },
      });
    }
    return true;
  } catch (err) {
    console.error(`[Sheets] upsertRow ${sheetName}:`, err.message);
    return false;
  }
}

// ── Per-type sync functions ───────────────────────────────
const BUILDERS = {
  customer: (d) => [
    d.id, d.name, d.phone, d.email || '', '', '',
    d.last_purchase_date || '', d.next_visit_date || '',
    d.whatsapp_reminders !== false ? 'Yes' : 'No',
    d.created_at?.slice(0,10) || '', new Date().toISOString().slice(0,10),
  ],
  prescription: (d) => [
    d.id, d.customer_id, d.customer_name || '', d.date || '', d.doctor || '',
    d.right_sph || '', d.right_cyl || '', d.right_axis || '', '',
    d.left_sph  || '', d.left_cyl  || '', d.left_axis  || '', '',
    '', '', d.created_at?.slice(0,10) || '',
  ],
  billing: (d) => [
    d.id, d.id?.toString().slice(-8).toUpperCase(), d.customer_id,
    d.customer_name || '', d.phone || '', d.created_at?.slice(0,10) || '',
    d.subtotal || 0, d.discount || 0, d.gst || 0, d.total || 0,
    d.paid ? d.total : 0, d.paid ? 0 : d.total,
    d.paid ? 'Paid' : 'Unpaid', 'Cash',
    d.created_at?.slice(0,10) || '',
  ],
  followup: (d) => [
    d.id, d.customer_id, d.customer_name || '', d.phone || '',
    d.type || '', d.title || '', d.due_date || '',
    d.priority || '', d.done ? 'Completed' : 'Pending',
    d.last_purchase_date || '', d.next_visit_date || '',
    d.done ? new Date().toISOString().slice(0,10) : '', '',
    d.created_at?.slice(0,10) || '', new Date().toISOString().slice(0,10),
  ],
  whatsapp: (d) => [
    d.id, d.followup_id || '', d.customer_id, d.customer_name || '',
    d.phone || '', d.message_type || '', d.message_status || '',
    d.provider_message_id || '', d.sent_at?.slice(0,19) || '',
    d.delivered_at || '', d.read_at || '', d.error || '',
  ],
};

const SHEET_NAMES = {
  customer:     'Customers',
  prescription: 'Prescriptions',
  billing:      'Invoices',
  followup:     'Follow-Ups',
  whatsapp:     'WhatsApp Messages',
};

// ── Main sync entry point ─────────────────────────────────
async function syncToSheets(type, id, data) {
  const builder   = BUILDERS[type];
  const sheetName = SHEET_NAMES[type];
  if (!builder || !sheetName) return;

  const values = builder(data);
  const success = await upsertRow(sheetName, id?.toString(), values);

  // Log sync status to Supabase
  try {
    await supabase.from('sheets_sync_log').upsert([{
      record_type: type,
      record_id:   id,
      status:      success ? 'synced' : 'failed',
      synced_at:   success ? new Date().toISOString() : null,
    }], { onConflict: 'record_id,record_type' });
  } catch { /* never crash */ }
}

// ── Full sync — replays all existing Supabase data ────────
async function fullSync() {
  const results = { customers: 0, prescriptions: 0, billing: 0, followups: 0, errors: [] };

  try {
    const { data: customers } = await supabase.from('customers').select('*');
    for (const c of customers || []) {
      await syncToSheets('customer', c.id, c);
      results.customers++;
    }

    const { data: prescriptions } = await supabase
      .from('prescriptions').select('*, customers(name)');
    for (const p of prescriptions || []) {
      await syncToSheets('prescription', p.id, { ...p, customer_name: p.customers?.name });
      results.prescriptions++;
    }

    const { data: billing } = await supabase
      .from('billing').select('*, customers(name, phone)');
    for (const b of billing || []) {
      await syncToSheets('billing', b.id, {
        ...b,
        customer_name: b.customers?.name,
        phone: b.customers?.phone,
      });
      results.billing++;
    }

    const { data: followups } = await supabase
      .from('followups').select('*, customers(name, phone)');
    for (const f of followups || []) {
      await syncToSheets('followup', f.id, {
        ...f,
        customer_name: f.customers?.name,
        phone: f.customers?.phone,
      });
      results.followups++;
    }
  } catch (err) {
    results.errors.push(err.message);
  }

  return results;
}

// ── Last sync time ────────────────────────────────────────
async function getLastSyncTime() {
  const { data } = await supabase
    .from('sheets_sync_log')
    .select('synced_at')
    .eq('status', 'synced')
    .order('synced_at', { ascending: false })
    .limit(1);
  return data?.[0]?.synced_at || null;
}

module.exports = { syncToSheets, fullSync, getLastSyncTime };
