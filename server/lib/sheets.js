const { google } = require('googleapis');
const path = require('path');

let sheets = null;

async function getSheetsClient() {
  if (sheets) return sheets;

  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!keyPath || !sheetId) return null;

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.resolve(keyPath),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const authClient = await auth.getClient();
    sheets = google.sheets({ version: 'v4', auth: authClient });
    return sheets;
  } catch (err) {
    console.warn('[Sheets] Google Auth initialization skipped:', err.message);
    return null;
  }
}

// ── Generic append row to any sheet tab ──────────────────
async function appendRow(sheetName, values) {
  try {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) return;

    const client = await getSheetsClient();
    if (!client) return;

    await client.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    });
  } catch (err) {
    // Log warning but never crash the API if Sheets fails
    console.warn(`[Sheets] Skipped append to ${sheetName}:`, err.message);
  }
}

// ── Append helpers per collection ────────────────────────
async function logCustomer(c) {
  await appendRow('Customers', [
    c.id, c.name, c.phone, c.email, c.age,
    new Date().toLocaleString('en-IN'),
  ]);
}

async function logOrder(o) {
  await appendRow('Orders', [
    o.id, o.customer_name, o.product, o.amount,
    o.status, new Date().toLocaleString('en-IN'),
  ]);
}

async function logPrescription(p) {
  await appendRow('Prescriptions', [
    p.id, p.customer_name, p.date,
    p.right_sph, p.right_cyl, p.right_axis,
    p.left_sph, p.left_cyl, p.left_axis,
    p.doctor,
  ]);
}

async function logInventory(i) {
  await appendRow('Inventory', [
    i.id, i.name, i.brand, i.category, i.sku,
    i.stock, i.price, new Date().toLocaleString('en-IN'),
  ]);
}

async function logBill(b) {
  await appendRow('Billing', [
    b.id, b.customer_name, b.date,
    b.subtotal, b.discount, b.gst, b.total,
    b.paid ? 'Paid' : 'Unpaid',
  ]);
}

async function logFollowup(f) {
  await appendRow('Followups', [
    f.id, f.customer_name, f.type,
    f.due_date, f.priority, f.done ? 'Done' : 'Pending',
    new Date().toLocaleString('en-IN'),
  ]);
}

module.exports = {
  logCustomer, logOrder, logPrescription,
  logInventory, logBill, logFollowup,
  getSheetsClient,
};
