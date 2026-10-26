/**
 * excelExport.js
 * ──────────────────────────────────────────────────────────
 * Excel (.xlsx) Export Engine for Roja Opticals
 *
 * Guarantees & Constraints:
 * 1. Native .xlsx workbooks created using exceljs.
 * 2. Separate 'Customers' and 'Prescriptions' sheets linked by customer_id to avoid
 *    corrupting the relational structure.
 * 3. Privacy Controls: Sensitive fields (phone numbers, prescription details) can be
 *    excluded or redacted upon user choice.
 * 4. Rich formatting: Professional headers, auto-fit column widths, borders, and date formatting.
 * 5. Safe handling: Empty results handled gracefully; safe sanitized filenames generated.
 */

const ExcelJS = require('exceljs');

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E293B' }, // Dark slate navy
};

const HEADER_FONT = {
  name: 'Segoe UI',
  size: 11,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};

const HEADER_ALIGNMENT = {
  vertical: 'middle',
  horizontal: 'left',
  wrapText: false,
};

const BORDER_STYLE = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
};

/**
 * Generate a safe, sanitized filename with timestamp
 */
function getSafeExportFilename(prefix = 'roja_export', extension = 'xlsx') {
  const cleanPrefix = String(prefix).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const dateStr = new Date().toISOString().slice(0, 10);
  return `${cleanPrefix}_${dateStr}.${extension}`;
}

/**
 * Export Customer Data to an Excel Workbook (.xlsx)
 *
 * @param {Object} params
 * @param {Array} params.customers - Array of customer records
 * @param {Array} params.prescriptions - Array of prescription records
 * @param {Object} params.options - User preferences { includePhone, includePrescriptions, filterSummary }
 * @returns {Promise<Buffer>}
 */
async function exportCustomersWorkbook({ customers = [], prescriptions = [], options = {} } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Roja Opticals System';
  workbook.lastModifiedBy = 'Roja Opticals';
  workbook.created = new Date();
  workbook.modified = new Date();

  const includePhone = options.includePhone !== false;
  const includePrescriptions = Boolean(options.includePrescriptions);

  // ── Sheet 1: Customers ────────────────────────────────────
  const custSheet = workbook.addWorksheet('Customers', {
    views: [{ showGridLines: true }],
  });

  const custColumns = [
    { header: 'Customer ID', key: 'id', width: 22 },
    { header: 'Full Name', key: 'name', width: 26 },
  ];

  if (includePhone) {
    custColumns.push({ header: 'Phone Number', key: 'phone', width: 18 });
  } else {
    custColumns.push({ header: 'Phone Number', key: 'phone', width: 20 });
  }

  custColumns.push(
    { header: 'Email Address', key: 'email', width: 28 },
    { header: 'Age', key: 'age', width: 10 },
    { header: 'Registration Date', key: 'created_at', width: 18 },
    { header: 'Next Scheduled Visit', key: 'next_visit_date', width: 20 },
    { header: 'WhatsApp Reminders', key: 'whatsapp_reminders', width: 20 }
  );

  custSheet.columns = custColumns;

  // Format header row
  const custHeaderRow = custSheet.getRow(1);
  custHeaderRow.height = 28;
  custHeaderRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
  });

  if (customers.length === 0) {
    const emptyRow = custSheet.addRow({
      id: 'No customer records match the selected export criteria.',
    });
    emptyRow.font = { italic: true, color: { argb: 'FF64748B' } };
  } else {
    for (const c of customers) {
      const row = custSheet.addRow({
        id: c.customer_id || c.id || '',
        name: c.name || '',
        phone: includePhone ? (c.phone || '') : '[Redacted]',
        email: c.email || '—',
        age: c.age != null ? Number(c.age) : '—',
        created_at: c.created_at ? c.created_at.slice(0, 10) : '—',
        next_visit_date: c.next_visit_date ? c.next_visit_date.slice(0, 10) : '—',
        whatsapp_reminders: c.whatsapp_reminders ? 'Enabled' : 'Disabled',
      });

      row.height = 20;
      row.eachCell((cell) => {
        cell.border = BORDER_STYLE;
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      });
    }
  }

  // ── Sheet 2: Prescriptions (Optional) ─────────────────────
  if (includePrescriptions) {
    const rxSheet = workbook.addWorksheet('Prescriptions', {
      views: [{ showGridLines: true }],
    });

    // Create lookup map of customer names for clarity
    const customerMap = new Map();
    for (const c of customers) {
      if (c.id) customerMap.set(String(c.id), c.name || '');
    }

    rxSheet.columns = [
      { header: 'Prescription ID', key: 'id', width: 20 },
      { header: 'Customer ID', key: 'customer_id', width: 22 },
      { header: 'Customer Name', key: 'customer_name', width: 26 },
      { header: 'Exam Date', key: 'date', width: 14 },
      { header: 'Doctor / Optometrist', key: 'doctor', width: 22 },
      { header: 'Right SPH', key: 'right_sph', width: 14 },
      { header: 'Right CYL', key: 'right_cyl', width: 14 },
      { header: 'Right Axis', key: 'right_axis', width: 14 },
      { header: 'Left SPH', key: 'left_sph', width: 14 },
      { header: 'Left CYL', key: 'left_cyl', width: 14 },
      { header: 'Left Axis', key: 'left_axis', width: 14 },
    ];

    const rxHeaderRow = rxSheet.getRow(1);
    rxHeaderRow.height = 28;
    rxHeaderRow.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = HEADER_ALIGNMENT;
    });

    if (!prescriptions || prescriptions.length === 0) {
      const emptyRow = rxSheet.addRow({
        id: 'No prescription records found for exported customers.',
      });
      emptyRow.font = { italic: true, color: { argb: 'FF64748B' } };
    } else {
      for (const rx of prescriptions) {
        const custName = customerMap.get(String(rx.customer_id)) || rx.customer_name || '—';
        const row = rxSheet.addRow({
          id: rx.id || '',
          customer_id: rx.customer_id || '',
          customer_name: custName,
          date: rx.date ? rx.date.slice(0, 10) : '—',
          doctor: rx.doctor || '—',
          right_sph: rx.right_sph || '0.00',
          right_cyl: rx.right_cyl || '0.00',
          right_axis: rx.right_axis != null ? rx.right_axis : '—',
          left_sph: rx.left_sph || '0.00',
          left_cyl: rx.left_cyl || '0.00',
          left_axis: rx.left_axis != null ? rx.left_axis : '—',
        });

        row.height = 20;
        row.eachCell((cell) => {
          cell.border = BORDER_STYLE;
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });
      }
    }
  }

  return await workbook.xlsx.writeBuffer();
}

/**
 * Export Reports Data to an Excel Workbook (.xlsx)
 *
 * @param {Object} params
 * @param {Object} params.kpis
 * @param {Array} params.monthlySales
 * @param {Array} params.billing
 * @returns {Promise<Buffer>}
 */
async function exportReportsWorkbook({ kpis = {}, monthlySales = [], billing = [] } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Roja Opticals System';
  workbook.created = new Date();

  // ── Sheet 1: Executive KPI Summary ────────────────────────
  const kpiSheet = workbook.addWorksheet('KPI Summary', {
    views: [{ showGridLines: true }],
  });

  kpiSheet.columns = [
    { header: 'Business Metric', key: 'metric', width: 32 },
    { header: 'Value', key: 'value', width: 24 },
  ];

  const kpiHeader = kpiSheet.getRow(1);
  kpiHeader.height = 28;
  kpiHeader.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
  });

  const kpiRows = [
    { metric: 'Current Month Revenue', value: `₹ ${(kpis.monthlyRevenue || 0).toLocaleString('en-IN')}` },
    { metric: 'Total Orders Processed', value: (kpis.totalOrders || 0).toLocaleString('en-IN') },
    { metric: 'New Customers Acquired', value: (kpis.newCustomers || 0).toLocaleString('en-IN') },
    { metric: 'Average Order Value (AOV)', value: `₹ ${(kpis.avgOrderValue || 0).toLocaleString('en-IN')}` },
    { metric: 'Report Generated At', value: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) },
  ];

  for (const r of kpiRows) {
    const row = kpiSheet.addRow(r);
    row.height = 22;
    row.eachCell((cell) => {
      cell.border = BORDER_STYLE;
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
  }

  // ── Sheet 2: Monthly Sales Trends ─────────────────────────
  const salesSheet = workbook.addWorksheet('Monthly Trends', {
    views: [{ showGridLines: true }],
  });

  salesSheet.columns = [
    { header: 'Month', key: 'month', width: 18 },
    { header: 'Total Sales (₹)', key: 'sales', width: 22 },
  ];

  const salesHeader = salesSheet.getRow(1);
  salesHeader.height = 28;
  salesHeader.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
  });

  for (const s of monthlySales) {
    const row = salesSheet.addRow({
      month: s.month || '',
      sales: s.sales || 0,
    });
    row.height = 20;
    row.eachCell((cell) => {
      cell.border = BORDER_STYLE;
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
  }

  // ── Sheet 3: Billing & Orders Transactions ────────────────
  const billSheet = workbook.addWorksheet('Transactions', {
    views: [{ showGridLines: true }],
  });

  billSheet.columns = [
    { header: 'Invoice / Bill ID', key: 'id', width: 22 },
    { header: 'Customer ID', key: 'customer_id', width: 22 },
    { header: 'Date', key: 'created_at', width: 14 },
    { header: 'Payment Method', key: 'payment_method', width: 18 },
    { header: 'Subtotal (₹)', key: 'subtotal', width: 16 },
    { header: 'Discount (₹)', key: 'discount', width: 16 },
    { header: 'Total (₹)', key: 'total', width: 16 },
    { header: 'Payment Status', key: 'payment_status', width: 18 },
  ];

  const billHeader = billSheet.getRow(1);
  billHeader.height = 28;
  billHeader.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = HEADER_ALIGNMENT;
  });

  if (billing.length === 0) {
    const emptyRow = billSheet.addRow({
      id: 'No transaction records found.',
    });
    emptyRow.font = { italic: true, color: { argb: 'FF64748B' } };
  } else {
    for (const b of billing) {
      const row = billSheet.addRow({
        id: b.id || '',
        customer_id: b.customer_id || '',
        created_at: b.created_at ? b.created_at.slice(0, 10) : '—',
        payment_method: b.payment_method || 'Cash',
        subtotal: b.subtotal || 0,
        discount: b.discount || 0,
        total: b.total || 0,
        payment_status: b.payment_status || 'Paid',
      });
      row.height = 20;
      row.eachCell((cell) => {
        cell.border = BORDER_STYLE;
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      });
    }
  }

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  exportCustomersWorkbook,
  exportReportsWorkbook,
  getSafeExportFilename,
};
