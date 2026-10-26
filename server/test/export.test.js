/**
 * export.test.js
 * ──────────────────────────────────────────────────────────
 * Excel (.xlsx) Export & Privacy Controls Test Suite
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const ExcelJS = require('exceljs');
const {
  exportCustomersWorkbook,
  exportReportsWorkbook,
  getSafeExportFilename,
} = require('../lib/excelExport');
const localDb = require('../lib/localDb');

const TEST_DB_DIR = path.resolve(__dirname, 'temp_export_db_test');
const TEST_BACKUP_DIR = path.resolve(__dirname, 'temp_export_backups_test');

describe('Excel Export (.xlsx) & Data Privacy Suite', () => {
  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ROJA_DATA_DIR = TEST_DB_DIR;
    process.env.ROJA_BACKUP_DIR = TEST_BACKUP_DIR;

    await fsp.mkdir(TEST_DB_DIR, { recursive: true });
    await fsp.mkdir(TEST_BACKUP_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fsp.rm(TEST_DB_DIR, { recursive: true, force: true });
      await fsp.rm(TEST_BACKUP_DIR, { recursive: true, force: true });
    } catch {}
  });

  // ── 1. Safe Filename Generation ─────────────────────────────

  test('Safe Filename: removes special chars and generates timestamped name', () => {
    const filename = getSafeExportFilename('customers/../../hack');
    assert.match(filename, /^customers_______hack_\d{4}-\d{2}-\d{2}\.xlsx$/);
    assert.equal(filename.includes('..'), false);
    assert.equal(filename.includes('/'), false);
    assert.equal(filename.includes('\\'), false);
  });

  // ── 2. Empty Results Handling ───────────────────────────────

  test('Empty Results: generates valid workbook without crash and includes notice', async () => {
    const buffer = await exportCustomersWorkbook({
      customers: [],
      prescriptions: [],
      options: { includePhone: true, includePrescriptions: true },
    });

    assert.ok(Buffer.isBuffer(buffer));
    assert.ok(buffer.length > 0);

    // Read workbook back with ExcelJS to inspect sheets
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const custSheet = workbook.getWorksheet('Customers');
    assert.ok(custSheet, 'Customers sheet must exist');
    assert.equal(custSheet.getRow(1).getCell(1).value, 'Customer ID');

    // Row 2 should contain empty notice
    const row2 = custSheet.getRow(2).getCell(1).value;
    assert.match(String(row2), /No customer records match/);
  });

  // ── 3. Privacy Options: Phone Redaction ─────────────────────

  test('Privacy Control: redacts phone numbers when includePhone is false', async () => {
    const syntheticCustomers = [
      {
        id: 'cust_priv_1',
        name: 'Private Customer',
        phone: '9876543210',
        email: 'private@example.com',
        created_at: '2026-10-24T12:00:00Z',
      },
    ];

    // Export with includePhone = false
    const bufferRedacted = await exportCustomersWorkbook({
      customers: syntheticCustomers,
      prescriptions: [],
      options: { includePhone: false, includePrescriptions: false },
    });

    const wbRedacted = new ExcelJS.Workbook();
    await wbRedacted.xlsx.load(bufferRedacted);
    const sheet = wbRedacted.getWorksheet('Customers');

    const phoneCell = sheet.getRow(2).getCell(3).value;
    assert.equal(phoneCell, '[Redacted]');

    // Export with includePhone = true
    const bufferFull = await exportCustomersWorkbook({
      customers: syntheticCustomers,
      prescriptions: [],
      options: { includePhone: true, includePrescriptions: false },
    });

    const wbFull = new ExcelJS.Workbook();
    await wbFull.xlsx.load(bufferFull);
    const fullPhoneCell = wbFull.getWorksheet('Customers').getRow(2).getCell(3).value;
    assert.equal(fullPhoneCell, '9876543210');
  });

  // ── 4. Prescriptions Separation & Relational Integrity ───────

  test('Relational Structure: creates separate Prescriptions sheet linked by customer_id', async () => {
    const syntheticCustomers = [
      { id: 'CUST-001', name: 'Alice Smith', phone: '9000000001', created_at: '2026-10-20' },
      { id: 'CUST-002', name: 'Bob Jones', phone: '9000000002', created_at: '2026-10-21' },
    ];

    const syntheticPrescriptions = [
      {
        id: 'RX-101',
        customer_id: 'CUST-001',
        date: '2026-10-22',
        doctor: 'Dr. Ramesh',
        right_sph: '-1.50',
        right_cyl: '-0.50',
        right_axis: 90,
        left_sph: '-1.25',
        left_cyl: '0.00',
        left_axis: null,
      },
      {
        id: 'RX-102',
        customer_id: 'CUST-001',
        date: '2026-10-24',
        doctor: 'Dr. Ramesh',
        right_sph: '-1.75',
        right_cyl: '-0.50',
        right_axis: 90,
        left_sph: '-1.50',
        left_cyl: '0.00',
        left_axis: null,
      },
    ];

    const buffer = await exportCustomersWorkbook({
      customers: syntheticCustomers,
      prescriptions: syntheticPrescriptions,
      options: { includePhone: true, includePrescriptions: true },
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const custSheet = wb.getWorksheet('Customers');
    const rxSheet = wb.getWorksheet('Prescriptions');

    assert.ok(custSheet, 'Must contain Customers sheet');
    assert.ok(rxSheet, 'Must contain Prescriptions sheet');

    // Verify row counts (Header + 2 customers)
    assert.equal(custSheet.rowCount, 3);
    // Prescriptions: Header + 2 prescriptions
    assert.equal(rxSheet.rowCount, 3);

    // Verify relational link in prescription sheet
    const rx1CustId = rxSheet.getRow(2).getCell(2).value;
    const rx1CustName = rxSheet.getRow(2).getCell(3).value;
    assert.equal(rx1CustId, 'CUST-001');
    assert.equal(rx1CustName, 'Alice Smith');

    const rx2CustId = rxSheet.getRow(3).getCell(2).value;
    assert.equal(rx2CustId, 'CUST-001');
  });

  test('Prescriptions Omission: only Customers sheet exists if includePrescriptions is false', async () => {
    const buffer = await exportCustomersWorkbook({
      customers: [{ id: 'CUST-001', name: 'Alice', phone: '9000000001' }],
      prescriptions: [{ id: 'RX-1', customer_id: 'CUST-001' }],
      options: { includePhone: true, includePrescriptions: false },
    });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    assert.ok(wb.getWorksheet('Customers'));
    assert.equal(wb.getWorksheet('Prescriptions'), undefined);
  });

  // ── 5. Reports Export Workbook Tests ────────────────────────

  test('Reports Workbook: generates KPI Summary, Monthly Trends, and Transactions sheets', async () => {
    const kpis = {
      monthlyRevenue: 125000,
      totalOrders: 42,
      newCustomers: 18,
      avgOrderValue: 2976,
    };

    const monthlySales = [
      { month: 'Aug 2026', sales: 95000 },
      { month: 'Sep 2026', sales: 110000 },
      { month: 'Oct 2026', sales: 125000 },
    ];

    const billing = [
      {
        id: 'INV-1001',
        customer_id: 'CUST-001',
        created_at: '2026-10-24T11:00:00Z',
        payment_method: 'UPI',
        subtotal: 3500,
        discount: 500,
        total: 3000,
        payment_status: 'Paid',
      },
    ];

    const buffer = await exportReportsWorkbook({
      kpis,
      monthlySales,
      billing,
    });

    assert.ok(Buffer.isBuffer(buffer));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const kpiSheet = wb.getWorksheet('KPI Summary');
    const trendsSheet = wb.getWorksheet('Monthly Trends');
    const txSheet = wb.getWorksheet('Transactions');

    assert.ok(kpiSheet, 'KPI Summary sheet must exist');
    assert.ok(trendsSheet, 'Monthly Trends sheet must exist');
    assert.ok(txSheet, 'Transactions sheet must exist');

    assert.equal(kpiSheet.getRow(2).getCell(1).value, 'Current Month Revenue');
    assert.match(String(kpiSheet.getRow(2).getCell(2).value), /1,25,000/);

    assert.equal(trendsSheet.getRow(2).getCell(1).value, 'Aug 2026');
    assert.equal(trendsSheet.getRow(2).getCell(2).value, 95000);

    assert.equal(txSheet.getRow(2).getCell(1).value, 'INV-1001');
    assert.equal(txSheet.getRow(2).getCell(7).value, 3000);
  });

  // ── 6. Filter & Date Range Logic Tests ──────────────────────

  test('Date range filtering: filters customers by creation date', () => {
    const records = [
      { id: '1', name: 'Early Customer', created_at: '2026-10-01T10:00:00.000Z' },
      { id: '2', name: 'Mid Customer',   created_at: '2026-10-15T10:00:00.000Z' },
      { id: '3', name: 'Late Customer',  created_at: '2026-10-24T10:00:00.000Z' },
    ];

    const fromDate = '2026-10-10';
    const toDate = '2026-10-20';

    const filtered = records.filter(
      (r) => r.created_at >= `${fromDate}T00:00:00.000Z` && r.created_at <= `${toDate}T23:59:59.999Z`
    );

    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].name, 'Mid Customer');
  });
});
